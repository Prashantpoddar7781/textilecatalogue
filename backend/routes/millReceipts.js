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
import { ensureMillParty, resolveSupplierForEntry } from '../utils/partyMaster.js';
import { matchesSupplierName, roundMoney } from '../utils/orderBilling.js';
import { resolvePartyPan, suggestTdsPercentFromPan } from '../utils/tds.js';

const router = express.Router();
const prisma = new PrismaClient();

const RETURN_MILL_NAME = 'GREY SALES INVENTORY';
const DEFAULT_HSN = '9988';
const DEFAULT_ENTRY_TYPE = 'JOB WORK';
const DEFAULT_PROCESS_TYPE = 'FINISH';
const PROCESS_TYPES = ['FINISH', 'RETURN'];

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

function normalizeProcessType(value) {
  const text = String(value || '').trim().toUpperCase();
  return PROCESS_TYPES.includes(text) ? text : DEFAULT_PROCESS_TYPE;
}

function isReturnProcess(processType) {
  return normalizeProcessType(processType) === 'RETURN';
}

/** TDS on taxable/job when On Amt is blank or 0; always derive Amt from % × base. */
function resolveTdsFields({ tdsOnAmtInput, tdsPercentInput, taxableAmount, invoiceValue, jobAmount }) {
  const tdsPercent = optionalNumber(tdsPercentInput) || 0;
  const rawOnAmt = optionalNumber(tdsOnAmtInput);
  const tdsOnAmt = (rawOnAmt != null && rawOnAmt > 0)
    ? rawOnAmt
    : roundMoney(taxableAmount || jobAmount || 0);
  const tdsAmount = roundMoney(tdsOnAmt * tdsPercent / 100);
  const netAfterTds = roundMoney((optionalNumber(invoiceValue) || 0) - tdsAmount);
  return { tdsOnAmt, tdsPercent, tdsAmount, netAfterTds };
}

/** RETURN restores grey to godown (reduces purchase despatchMts). FINISH does not. */
async function adjustPurchaseStockForReturn(tx, purchaseId, deltaDespatchMts) {
  if (!purchaseId || !deltaDespatchMts) return;
  const purchase = await tx.greyPurchase.findFirst({ where: { id: purchaseId } });
  if (!purchase) return;
  await tx.greyPurchase.update({
    where: { id: purchaseId },
    data: {
      despatchMts: roundMoney(Math.max(0, Number(purchase.despatchMts || 0) + deltaDespatchMts))
    }
  });
}

function normalizeTakaDetails(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, index) => {
      const greyMts = roundMoney(row.greyMts ?? row.mts ?? 0);
      const recMts = roundMoney(row.recMts ?? row.finishMts ?? greyMts);
      const shortMts = roundMoney(Math.max(0, greyMts - recMts));
      const shortPct = greyMts > 0 ? roundMoney((shortMts / greyMts) * 100) : 0;
      return {
        srNo: Number(row.srNo) || index + 1,
        greyMts,
        recMts,
        shortMts,
        shortPct
      };
    })
    .filter(row => row.srNo > 0 && (row.greyMts > 0 || row.recMts > 0));
}

async function getCompanyContext(userId) {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, firmName: true } }),
    prisma.businessProfile.findUnique({ where: { userId } })
  ]);
  return {
    companyName: profile?.tradeName || profile?.legalName || user?.firmName || user?.name || '',
    businessState: profile?.state || '',
    defaultHsnCode: DEFAULT_HSN,
    defaultGstRate: profile?.defaultGstRate ?? 5
  };
}

async function getReceivedSrNos(greyDispatchId, excludeReceiptId = null) {
  const receipts = await prisma.millReceipt.findMany({
    where: {
      greyDispatchId,
      status: { not: 'cancelled' },
      ...(excludeReceiptId ? { id: { not: excludeReceiptId } } : {})
    },
    select: { takaDetails: true, recMts: true }
  });
  const srNos = new Set();
  let receivedMts = 0;
  for (const receipt of receipts) {
    receivedMts += Number(receipt.recMts) || 0;
    const rows = Array.isArray(receipt.takaDetails) ? receipt.takaDetails : [];
    for (const row of rows) {
      if (row?.srNo != null) srNos.add(Number(row.srNo));
    }
  }
  return { srNos, receivedMts: roundMoney(receivedMts) };
}

function resolvePlaceOfSupply({ millGstin, placeOfSupply, stateCode }) {
  if (optionalString(placeOfSupply)) return optionalString(placeOfSupply);
  const fromGst = getStateFromGstin(millGstin);
  if (fromGst.stateName) return fromGst.stateName;
  if (optionalString(stateCode)) {
    const mapped = getStateFromGstin(String(stateCode).padStart(2, '0'));
    return mapped.stateName || null;
  }
  return null;
}

function buildDispatchPendingSummary(dispatch, receivedSrNos, receivedMts) {
  const allRows = Array.isArray(dispatch.takaDetails)
    ? normalizeTakaDetails(dispatch.takaDetails.map(r => ({
      srNo: r.srNo,
      greyMts: r.mts ?? r.greyMts,
      recMts: r.mts ?? r.greyMts
    })))
    : [];
  const pendingRows = allRows.length
    ? allRows.filter(row => !receivedSrNos.has(row.srNo))
    : [];
  const despMts = roundMoney(dispatch.despMts);
  const pendingMts = allRows.length
    ? roundMoney(pendingRows.reduce((s, r) => s + r.greyMts, 0))
    : roundMoney(Math.max(0, despMts - receivedMts));

  return {
    id: dispatch.id,
    greyPurchaseId: dispatch.greyPurchaseId,
    srNo: dispatch.srNo,
    challanNo: dispatch.challanNo,
    dispatchDate: dispatch.dispatchDate,
    millName: dispatch.millName,
    millLotNo: dispatch.millLotNo,
    purSr: dispatch.purSr,
    quality: dispatch.quality,
    weaverName: dispatch.weaverName,
    brokerName: dispatch.brokerName,
    ourMarka: dispatch.ourMarka,
    rate: dispatch.rate,
    despTaka: dispatch.despTaka,
    despMts,
    pendingTaka: pendingRows.length || Math.max(0, Math.round(Number(dispatch.despTaka) || 0) - receivedSrNos.size),
    pendingMts,
    receivedMts,
    takaDetails: allRows
  };
}

router.get('/meta', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const ctx = await getCompanyContext(userId);
    const count = await prisma.millReceipt.count({ where: { userId } });
    const [customers, suppliers] = await Promise.all([
      prisma.customer.findMany({
        where: { userId },
        orderBy: { organizationName: 'asc' },
        take: 300
      }),
      prisma.supplier.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
        take: 300
      })
    ]);

    const millMap = new Map();
    for (const s of suppliers) {
      const pan = resolvePartyPan({ panNumber: s.panNumber, gstNumber: s.gstNumber });
      millMap.set(s.name.toLowerCase(), {
        name: s.name,
        gstNumber: s.gstNumber || null,
        panNumber: pan || null,
        suggestedTdsPercent: suggestTdsPercentFromPan(pan),
        source: 'supplier'
      });
    }
    for (const c of customers) {
      const key = c.organizationName.toLowerCase();
      if (millMap.has(key)) {
        const current = millMap.get(key);
        const pan = resolvePartyPan({
          panNumber: current.panNumber || c.panNumber,
          gstNumber: current.gstNumber || c.gstNumber
        });
        millMap.set(key, {
          ...current,
          gstNumber: current.gstNumber || c.gstNumber || null,
          panNumber: pan || null,
          suggestedTdsPercent: suggestTdsPercentFromPan(pan)
        });
        continue;
      }
      const pan = resolvePartyPan({ panNumber: c.panNumber, gstNumber: c.gstNumber });
      millMap.set(key, {
        name: c.organizationName,
        gstNumber: c.gstNumber || null,
        panNumber: pan || null,
        suggestedTdsPercent: suggestTdsPercentFromPan(pan),
        source: 'customer'
      });
    }

    const millParties = Array.from(millMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      ...ctx,
      nextVoucherNo: count + 1,
      entryTypes: [DEFAULT_ENTRY_TYPE],
      processTypes: PROCESS_TYPES,
      defaultProcessType: DEFAULT_PROCESS_TYPE,
      mills: millParties.map(m => m.name),
      millParties,
      states: INDIAN_STATES
    });
  } catch (error) {
    next(error);
  }
});

router.post('/calculate', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const ctx = await getCompanyContext(req.user.userId);
    const millGstin = optionalString(req.body.millGstin);
    const placeOfSupply = resolvePlaceOfSupply({
      millGstin,
      placeOfSupply: req.body.placeOfSupply,
      stateCode: req.body.stateCode
    });
    const jobAmount = optionalNumber(req.body.jobAmount)
      ?? roundMoney((optionalNumber(req.body.recMts) || 0) * (optionalNumber(req.body.jobRate) || 0));
    const rdLessAddAmt = optionalNumber(req.body.rdLessAddAmt) || 0;
    const grossAmount = optionalNumber(req.body.grossAmount) ?? roundMoney(jobAmount + rdLessAddAmt);

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
      partyGstin: millGstin,
      stateCode: req.body.stateCode
    });

    const invoiceValue = totals.netAmount;
    const { tdsOnAmt, tdsPercent, tdsAmount, netAfterTds } = resolveTdsFields({
      tdsOnAmtInput: req.body.tdsOnAmt,
      tdsPercentInput: req.body.tdsPercent,
      taxableAmount: totals.taxableAmount,
      invoiceValue,
      jobAmount
    });

    res.json({
      totals: {
        ...totals,
        jobAmount,
        rdLessAddAmt,
        invoiceValue,
        tdsOnAmt,
        tdsPercent,
        tdsAmount,
        netAfterTds,
        placeOfSupply,
        businessState: ctx.businessState
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/pending-dispatches', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const millName = optionalString(req.query.millName);
    if (!millName) {
      return res.status(400).json({ error: 'millName is required' });
    }

    const dispatches = await prisma.greyDispatch.findMany({
      where: {
        userId,
        status: { not: 'cancelled' },
        transactionType: { not: 'RETURN' },
        millName: { not: RETURN_MILL_NAME }
      },
      include: {
        greyPurchase: { select: { id: true, srNo: true, billNo: true, partyName: true } }
      },
      orderBy: [{ dispatchDate: 'desc' }, { srNo: 'desc' }]
    });

    const matched = dispatches.filter(d => matchesSupplierName(d.millName, millName));
    const entries = [];
    for (const dispatch of matched) {
      const { srNos, receivedMts } = await getReceivedSrNos(dispatch.id);
      const summary = buildDispatchPendingSummary(dispatch, srNos, receivedMts);
      if (summary.pendingMts > 0.01) {
        entries.push({
          ...summary,
          greyPurchase: dispatch.greyPurchase
        });
      }
    }

    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

router.get('/pending-dispatches/:dispatchId/available-takas', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const dispatch = await prisma.greyDispatch.findFirst({
      where: {
        id: req.params.dispatchId,
        userId,
        status: { not: 'cancelled' },
        transactionType: { not: 'RETURN' }
      }
    });
    if (!dispatch) return res.status(404).json({ error: 'Grey dispatch not found' });

    const { srNos, receivedMts } = await getReceivedSrNos(dispatch.id);
    const summary = buildDispatchPendingSummary(dispatch, srNos, receivedMts);
    const availableRows = summary.takaDetails.filter(row => !srNos.has(row.srNo));

    // Fallback when dispatch has no taka breakdown
    const fallbackRows = availableRows.length
      ? availableRows
      : (summary.pendingMts > 0
        ? [{ srNo: 1, greyMts: summary.pendingMts, recMts: summary.pendingMts, shortMts: 0, shortPct: 0 }]
        : []);

    res.json({
      dispatch: summary,
      availableRows: fallbackRows,
      receivedSrNos: Array.from(srNos),
      receivedMts
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const entries = await prisma.millReceipt.findMany({
      where: { userId: req.user.userId, status: { not: 'cancelled' } },
      include: {
        greyDispatch: true,
        greyPurchase: { select: { id: true, srNo: true, billNo: true, partyName: true } }
      },
      orderBy: [{ receiptDate: 'desc' }, { createdAt: 'desc' }],
      take: 300
    });
    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

router.get('/report', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const filter = String(req.query.filter || 'all').toLowerCase();
    const validFilters = new Set([
      'all', 'mill_wise', 'quality_wise', 'date_wise', 'lot_wise', 'desp_wise'
    ]);
    const activeFilter = validFilters.has(filter) ? filter : 'all';
    const millName = optionalString(req.query.millName);
    const fromDate = optionalString(req.query.fromDate);
    const toDate = optionalString(req.query.toDate);
    const ctx = await getCompanyContext(userId);

    const where = {
      userId,
      status: { not: 'cancelled' }
    };
    if (millName) where.millName = { contains: millName, mode: 'insensitive' };
    if (fromDate || toDate) {
      where.receiptDate = {};
      if (fromDate) where.receiptDate.gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        where.receiptDate.lte = end;
      }
    }

    const receipts = await prisma.millReceipt.findMany({
      where,
      include: {
        greyDispatch: { select: { srNo: true, challanNo: true, despMts: true, despTaka: true } }
      },
      orderBy: [{ receiptDate: 'asc' }, { voucherNo: 'asc' }, { createdAt: 'asc' }]
    });

    const rows = receipts.map(r => {
      const despMts = roundMoney(r.greyMts || r.greyDispatch?.despMts || 0);
      const recMts = roundMoney(r.recMts);
      const shortMts = roundMoney(r.shortMts || Math.max(0, despMts - recMts));
      const shortPct = despMts > 0 ? roundMoney((shortMts / despMts) * 100) : roundMoney(r.shortPct);
      return {
        id: r.id,
        despNo: r.despNo || String(r.greyDispatch?.srNo || r.greyDispatch?.challanNo || '-'),
        lotNo: r.lotNo,
        billNo: r.billNo || '-',
        receiptDate: r.receiptDate,
        despMts,
        recTaka: r.recTaka,
        recMts,
        jobRate: r.jobRate,
        shortMts,
        shortPct,
        quality: r.quality || '-',
        processType: r.processType || 'FINISH',
        jobAmount: r.jobAmount,
        millName: r.millName,
        voucherNo: r.voucherNo,
        printStyle: r.printStyle,
        marka: r.marka,
        invoiceValue: r.invoiceValue || r.netAfterTds,
        netAfterTds: r.netAfterTds
      };
    });

    const emptyTotals = () => ({
      despMts: 0,
      recTaka: 0,
      recMts: 0,
      shortMts: 0,
      jobAmount: 0,
      entries: 0
    });

    const addTotals = (acc, row) => {
      acc.despMts = roundMoney(acc.despMts + row.despMts);
      acc.recTaka = roundMoney(acc.recTaka + row.recTaka);
      acc.recMts = roundMoney(acc.recMts + row.recMts);
      acc.shortMts = roundMoney(acc.shortMts + row.shortMts);
      acc.jobAmount = roundMoney(acc.jobAmount + row.jobAmount);
      acc.entries += 1;
      return acc;
    };

    const totals = rows.reduce((acc, row) => addTotals(acc, row), emptyTotals());
    totals.shortPct = totals.despMts > 0
      ? roundMoney((totals.shortMts / totals.despMts) * 100)
      : 0;
    totals.jobRate = totals.recMts > 0
      ? roundMoney(totals.jobAmount / totals.recMts)
      : 0;

    const groupKeyFn = {
      mill_wise: (r) => r.millName || 'Unknown Mill',
      quality_wise: (r) => r.quality || 'Unknown Quality',
      date_wise: (r) => new Date(r.receiptDate).toISOString().slice(0, 10),
      lot_wise: (r) => r.lotNo || 'No Lot',
      desp_wise: (r) => String(r.despNo || '-')
    };

    let groups = [];
    if (activeFilter !== 'all' && groupKeyFn[activeFilter]) {
      const map = new Map();
      for (const row of rows) {
        const key = groupKeyFn[activeFilter](row);
        const current = map.get(key) || { key, label: key, rows: [], totals: emptyTotals() };
        current.rows.push(row);
        addTotals(current.totals, row);
        current.totals.shortPct = current.totals.despMts > 0
          ? roundMoney((current.totals.shortMts / current.totals.despMts) * 100)
          : 0;
        current.totals.jobRate = current.totals.recMts > 0
          ? roundMoney(current.totals.jobAmount / current.totals.recMts)
          : 0;
        map.set(key, current);
      }
      groups = Array.from(map.values()).sort((a, b) => String(a.label).localeCompare(String(b.label)));
    }

    res.json({
      filter: activeFilter,
      companyName: ctx.companyName,
      millName: millName || null,
      fromDate,
      toDate,
      reportDate: new Date().toISOString(),
      rows: activeFilter === 'all' ? rows : [],
      groups,
      totals
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const entry = await prisma.millReceipt.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
      include: {
        greyDispatch: true,
        greyPurchase: true
      }
    });
    if (!entry) return res.status(404).json({ error: 'Mill receipt not found' });

    // Repair display when older rows saved TDS % with On Amt / Amt stuck at 0
    const tdsPercent = Number(entry.tdsPercent) || 0;
    let tdsOnAmt = roundMoney(entry.tdsOnAmt || 0);
    let tdsAmount = roundMoney(entry.tdsAmount || 0);
    if (tdsPercent > 0 && (tdsOnAmt <= 0 || tdsAmount <= 0)) {
      if (tdsOnAmt <= 0) {
        tdsOnAmt = roundMoney(entry.taxableAmount || entry.jobAmount || 0);
      }
      if (tdsAmount <= 0) {
        tdsAmount = roundMoney(tdsOnAmt * tdsPercent / 100);
      }
    }
    const invoiceValue = roundMoney(entry.invoiceValue || 0);
    const netAfterTds = tdsAmount > 0
      ? roundMoney(invoiceValue - tdsAmount)
      : roundMoney(entry.netAfterTds || invoiceValue);

    res.json({
      entry: {
        ...entry,
        tdsOnAmt,
        tdsPercent,
        tdsAmount,
        netAfterTds
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, requireActiveSubscription, [
  body('greyDispatchId').trim().notEmpty().withMessage('Grey dispatch is required'),
  body('millName').trim().notEmpty().withMessage('Mill is required'),
  body('lotNo').trim().notEmpty().withMessage('Lot number is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const ctx = await getCompanyContext(userId);
    const greyDispatchId = String(req.body.greyDispatchId);
    const dispatch = await prisma.greyDispatch.findFirst({
      where: {
        id: greyDispatchId,
        userId,
        status: { not: 'cancelled' },
        transactionType: { not: 'RETURN' }
      }
    });
    if (!dispatch) return res.status(404).json({ error: 'Grey dispatch not found' });

    const millName = optionalString(req.body.millName) || dispatch.millName;
    if (!matchesSupplierName(dispatch.millName, millName)) {
      return res.status(400).json({ error: 'Selected dispatch does not belong to this mill.' });
    }

    const takaDetails = normalizeTakaDetails(req.body.takaDetails);
    const { srNos: alreadyReceived } = await getReceivedSrNos(dispatch.id);
    for (const row of takaDetails) {
      if (alreadyReceived.has(row.srNo)) {
        return res.status(400).json({ error: `Taka ${row.srNo} is already received from this dispatch.` });
      }
    }

    const takaGreyMts = roundMoney(takaDetails.reduce((s, r) => s + r.greyMts, 0));
    const takaRecMts = roundMoney(takaDetails.reduce((s, r) => s + r.recMts, 0));
    const greyMts = optionalNumber(req.body.greyMts)
      ?? (takaGreyMts > 0 ? takaGreyMts : roundMoney(dispatch.despMts));
    const recMts = optionalNumber(req.body.recMts) ?? takaRecMts;
    const recTaka = optionalNumber(req.body.recTaka) ?? takaDetails.length;

    const processType = normalizeProcessType(req.body.processType);
    const isReturn = isReturnProcess(processType);
    const qtyCheck = isReturn ? greyMts : recMts;

    if (qtyCheck <= 0) {
      return res.status(400).json({
        error: isReturn
          ? 'Returned grey meters must be greater than zero.'
          : 'Received meters must be greater than zero.'
      });
    }

    const shortMts = isReturn
      ? 0
      : (optionalNumber(req.body.shortMts) ?? roundMoney(Math.max(0, greyMts - recMts)));
    const shortPct = isReturn
      ? 0
      : (optionalNumber(req.body.shortPct)
        ?? (greyMts > 0 ? roundMoney((shortMts / greyMts) * 100) : 0));

    let jobRate = 0;
    let jobAmount = 0;
    let rdLessAddAmt = 0;
    let rdPerMtr = 0;
    let invoiceValue = 0;
    let tdsOnAmt = 0;
    let tdsPercent = 0;
    let tdsAmount = 0;
    let netAfterTds = 0;
    let totals = {
      discountPercent: 0,
      discountAmount: 0,
      otherLessBefore: 0,
      otherAddBefore: 0,
      taxableAmount: 0,
      gstRate: optionalNumber(req.body.gstRate) ?? ctx.defaultGstRate,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: 0,
      igstAmount: 0,
      grossAmount: 0,
      placeOfSupply: null,
      stateCode: null,
      gstTypeLabel: null,
      gstType: null
    };

    const millGstin = optionalString(req.body.millGstin);
    const placeOfSupply = resolvePlaceOfSupply({
      millGstin,
      placeOfSupply: req.body.placeOfSupply,
      stateCode: req.body.stateCode
    });

    if (!isReturn) {
      jobRate = optionalNumber(req.body.jobRate) || 0;
      jobAmount = optionalNumber(req.body.jobAmount) ?? roundMoney(recMts * jobRate);
      rdLessAddAmt = optionalNumber(req.body.rdLessAddAmt) || 0;
      rdPerMtr = optionalNumber(req.body.rdPerMtr) || 0;
      const grossAmount = optionalNumber(req.body.grossAmount) ?? roundMoney(jobAmount + rdLessAddAmt);

      totals = calculateGreyPurchaseTotals({
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
        partyGstin: millGstin,
        stateCode: req.body.stateCode
      });

      invoiceValue = totals.netAmount;
      ({ tdsOnAmt, tdsPercent, tdsAmount, netAfterTds } = resolveTdsFields({
        tdsOnAmtInput: req.body.tdsOnAmt,
        tdsPercentInput: req.body.tdsPercent,
        taxableAmount: totals.taxableAmount,
        invoiceValue,
        jobAmount
      }));
    } else {
      // RETURN (reprocess): grey back unfinished — no job charges / GST / TDS
      netAfterTds = 0;
    }

    const count = await prisma.millReceipt.count({ where: { userId } });
    await ensureMillParty(prisma, userId, millName);
    await resolveSupplierForEntry(prisma, userId, {
      partyName: millName,
      partyGstin: millGstin,
      placeOfSupply: totals.placeOfSupply || placeOfSupply,
      partyMsme: optionalString(req.body.partyMsme)
    });

    const effectiveRecMts = isReturn ? greyMts : recMts;

    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.millReceipt.create({
        data: {
          userId,
          greyDispatchId: dispatch.id,
          greyPurchaseId: dispatch.greyPurchaseId,
          companyName: optionalString(req.body.companyName) || dispatch.companyName || ctx.companyName,
          millName,
          millGstin,
          partyMsme: optionalString(req.body.partyMsme),
          entryType: optionalString(req.body.entryType) || DEFAULT_ENTRY_TYPE,
          processType,
          hsnCode: optionalString(req.body.hsnCode) || DEFAULT_HSN,
          voucherNo: optionalNumber(req.body.voucherNo) ?? (count + 1),
          receiptDate: req.body.receiptDate ? new Date(req.body.receiptDate) : new Date(),
          billNo: optionalString(req.body.billNo),
          placeOfSupply: totals.placeOfSupply || placeOfSupply,
          stateCode: totals.stateCode || getStateCodeFromName(placeOfSupply),
          gstType: totals.gstTypeLabel || totals.gstType,
          lotNo: optionalString(req.body.lotNo),
          despNo: optionalString(req.body.despNo)
            || String(dispatch.srNo || dispatch.challanNo || ''),
          recChallan: optionalString(req.body.recChallan),
          marka: optionalString(req.body.marka) || dispatch.ourMarka,
          quality: optionalString(req.body.quality) || dispatch.quality,
          printStyle: optionalString(req.body.printStyle),
          recTaka,
          recMts: effectiveRecMts,
          greyMts,
          shortMts,
          shortPct,
          jobRate,
          jobAmount,
          rdPerMtr,
          rdLessAddAmt,
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
          grossAmount: totals.grossAmount,
          invoiceValue,
          tdsOnAmt,
          tdsPercent,
          tdsAmount,
          netAfterTds,
          remarks: optionalString(req.body.remarks),
          takaDetails: takaDetails.length ? takaDetails : null
        },
        include: {
          greyDispatch: true,
          greyPurchase: { select: { id: true, srNo: true, billNo: true, partyName: true } }
        }
      });

      // RETURN: restore grey meters to godown stock
      if (isReturn && dispatch.greyPurchaseId) {
        await adjustPurchaseStockForReturn(tx, dispatch.greyPurchaseId, -greyMts);
      }

      return created;
    });

    res.status(201).json({ entry });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticateToken, requireActiveSubscription, [
  body('millName').trim().notEmpty().withMessage('Mill is required'),
  body('lotNo').trim().notEmpty().withMessage('Lot number is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const existing = await prisma.millReceipt.findFirst({
      where: { id: req.params.id, userId, status: { not: 'cancelled' } }
    });
    if (!existing) return res.status(404).json({ error: 'Mill receipt not found' });

    const ctx = await getCompanyContext(userId);
    const greyDispatchId = optionalString(req.body.greyDispatchId) || existing.greyDispatchId;
    const dispatch = await prisma.greyDispatch.findFirst({
      where: {
        id: greyDispatchId,
        userId,
        status: { not: 'cancelled' },
        transactionType: { not: 'RETURN' }
      }
    });
    if (!dispatch) return res.status(404).json({ error: 'Grey dispatch not found' });

    const millName = optionalString(req.body.millName) || dispatch.millName;
    const takaDetails = normalizeTakaDetails(req.body.takaDetails);
    const { srNos: alreadyReceived } = await getReceivedSrNos(dispatch.id, existing.id);
    for (const row of takaDetails) {
      if (alreadyReceived.has(row.srNo)) {
        return res.status(400).json({ error: `Taka ${row.srNo} is already received from this dispatch.` });
      }
    }

    const takaGreyMts = roundMoney(takaDetails.reduce((s, r) => s + r.greyMts, 0));
    const takaRecMts = roundMoney(takaDetails.reduce((s, r) => s + r.recMts, 0));
    const greyMts = optionalNumber(req.body.greyMts)
      ?? (takaGreyMts > 0 ? takaGreyMts : roundMoney(existing.greyMts || dispatch.despMts));
    const recMts = optionalNumber(req.body.recMts) ?? (takaRecMts || existing.recMts);
    const recTaka = optionalNumber(req.body.recTaka) ?? (takaDetails.length || existing.recTaka);

    const processType = normalizeProcessType(req.body.processType ?? existing.processType);
    const isReturn = isReturnProcess(processType);
    const wasReturn = isReturnProcess(existing.processType);
    const qtyCheck = isReturn ? greyMts : recMts;

    if (qtyCheck <= 0) {
      return res.status(400).json({
        error: isReturn
          ? 'Returned grey meters must be greater than zero.'
          : 'Received meters must be greater than zero.'
      });
    }

    const shortMts = isReturn
      ? 0
      : (optionalNumber(req.body.shortMts) ?? roundMoney(Math.max(0, greyMts - recMts)));
    const shortPct = isReturn
      ? 0
      : (optionalNumber(req.body.shortPct)
        ?? (greyMts > 0 ? roundMoney((shortMts / greyMts) * 100) : 0));

    let jobRate = 0;
    let jobAmount = 0;
    let rdLessAddAmt = 0;
    let rdPerMtr = 0;
    let invoiceValue = 0;
    let tdsOnAmt = 0;
    let tdsPercent = 0;
    let tdsAmount = 0;
    let netAfterTds = 0;
    let totals = {
      discountPercent: 0,
      discountAmount: 0,
      otherLessBefore: 0,
      otherAddBefore: 0,
      taxableAmount: 0,
      gstRate: optionalNumber(req.body.gstRate) ?? existing.gstRate ?? ctx.defaultGstRate,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: 0,
      igstAmount: 0,
      grossAmount: 0,
      placeOfSupply: null,
      stateCode: null,
      gstTypeLabel: null,
      gstType: null
    };

    const millGstin = optionalString(req.body.millGstin) || existing.millGstin;
    const placeOfSupply = resolvePlaceOfSupply({
      millGstin,
      placeOfSupply: req.body.placeOfSupply || existing.placeOfSupply,
      stateCode: req.body.stateCode || existing.stateCode
    });

    if (!isReturn) {
      jobRate = optionalNumber(req.body.jobRate) ?? existing.jobRate;
      jobAmount = optionalNumber(req.body.jobAmount) ?? roundMoney(recMts * jobRate);
      rdLessAddAmt = optionalNumber(req.body.rdLessAddAmt) ?? existing.rdLessAddAmt;
      rdPerMtr = optionalNumber(req.body.rdPerMtr) ?? existing.rdPerMtr;
      const grossAmount = optionalNumber(req.body.grossAmount) ?? roundMoney(jobAmount + rdLessAddAmt);

      totals = calculateGreyPurchaseTotals({
        grossAmount,
        discountPercent: req.body.discountPercent ?? existing.discountPercent,
        discountAmount: req.body.discountAmount,
        otherAddBefore: req.body.otherAdd ?? existing.otherAdd,
        otherLessBefore: req.body.otherLess ?? existing.otherLess,
        otherAddAfter: 0,
        otherLessAfter: 0,
        gstRate: req.body.gstRate ?? existing.gstRate ?? ctx.defaultGstRate,
        placeOfSupply,
        businessState: ctx.businessState,
        partyGstin: millGstin,
        stateCode: req.body.stateCode || existing.stateCode
      });

      invoiceValue = totals.netAmount;
      ({ tdsOnAmt, tdsPercent, tdsAmount, netAfterTds } = resolveTdsFields({
        tdsOnAmtInput: req.body.tdsOnAmt,
        tdsPercentInput: req.body.tdsPercent,
        taxableAmount: totals.taxableAmount,
        invoiceValue,
        jobAmount
      }));
    }

    await ensureMillParty(prisma, userId, millName);
    await resolveSupplierForEntry(prisma, userId, {
      partyName: millName,
      partyGstin: millGstin,
      placeOfSupply: totals.placeOfSupply || placeOfSupply,
      partyMsme: optionalString(req.body.partyMsme) || existing.partyMsme
    });

    const effectiveRecMts = isReturn ? greyMts : recMts;
    const purchaseId = dispatch.greyPurchaseId || existing.greyPurchaseId;
    // Net change to despatchMts: undo previous RETURN restore, apply new RETURN restore
    const prevRestored = wasReturn ? roundMoney(existing.greyMts || 0) : 0;
    const nextRestored = isReturn ? greyMts : 0;
    const stockDelta = roundMoney(prevRestored - nextRestored);

    const entry = await prisma.$transaction(async (tx) => {
      const updated = await tx.millReceipt.update({
        where: { id: existing.id },
        data: {
          greyDispatchId: dispatch.id,
          greyPurchaseId: dispatch.greyPurchaseId,
          companyName: optionalString(req.body.companyName) || existing.companyName || ctx.companyName,
          millName,
          millGstin,
          partyMsme: optionalString(req.body.partyMsme) ?? existing.partyMsme,
          entryType: optionalString(req.body.entryType) || existing.entryType || DEFAULT_ENTRY_TYPE,
          processType,
          hsnCode: optionalString(req.body.hsnCode) || existing.hsnCode || DEFAULT_HSN,
          voucherNo: optionalNumber(req.body.voucherNo) ?? existing.voucherNo,
          receiptDate: req.body.receiptDate ? new Date(req.body.receiptDate) : existing.receiptDate,
          billNo: optionalString(req.body.billNo) ?? existing.billNo,
          placeOfSupply: totals.placeOfSupply || placeOfSupply,
          stateCode: totals.stateCode || getStateCodeFromName(placeOfSupply) || existing.stateCode,
          gstType: totals.gstTypeLabel || totals.gstType,
          lotNo: optionalString(req.body.lotNo) || existing.lotNo,
          despNo: optionalString(req.body.despNo)
            || existing.despNo
            || String(dispatch.srNo || dispatch.challanNo || ''),
          recChallan: optionalString(req.body.recChallan) ?? existing.recChallan,
          marka: optionalString(req.body.marka) ?? existing.marka,
          quality: optionalString(req.body.quality) ?? existing.quality,
          printStyle: optionalString(req.body.printStyle) ?? existing.printStyle,
          recTaka,
          recMts: effectiveRecMts,
          greyMts,
          shortMts,
          shortPct,
          jobRate,
          jobAmount,
          rdPerMtr,
          rdLessAddAmt,
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
          grossAmount: totals.grossAmount,
          invoiceValue,
          tdsOnAmt,
          tdsPercent,
          tdsAmount,
          netAfterTds,
          remarks: optionalString(req.body.remarks) ?? existing.remarks,
          takaDetails: takaDetails.length ? takaDetails : existing.takaDetails
        },
        include: {
          greyDispatch: true,
          greyPurchase: { select: { id: true, srNo: true, billNo: true, partyName: true } }
        }
      });

      if (purchaseId && stockDelta !== 0) {
        await adjustPurchaseStockForReturn(tx, purchaseId, stockDelta);
      }

      return updated;
    });

    res.json({ entry });
  } catch (error) {
    next(error);
  }
});

export default router;
