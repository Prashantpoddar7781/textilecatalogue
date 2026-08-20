import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { normalizeTransactionType, DEFAULT_PURCHASE_TRANSACTION_TYPE, EXPENSE_TRANSACTION_TYPES, isExpensePurchaseType, getGstDefaultsForTransactionType } from '../constants/erpTransactionTypes.js';
import { findOrCreateSupplier, resolveSupplierForEntry } from '../utils/partyMaster.js';
import { allocateNextTypeBillNumber } from '../utils/transactionBilling.js';
import { buildSupplierLedger } from '../utils/accountLedger.js';
import { roundMoney } from '../utils/orderBilling.js';
import { aggregateErpLines, isPurchaseReturn, normalizeErpLines } from '../utils/erpLineItems.js';
import { getStateFromGstin, isInterStateSupply } from '../utils/gstCalculation.js';

const router = express.Router();
const prisma = new PrismaClient();

const GEMINI_MODEL = process.env.GEMINI_PURCHASE_MODEL || 'gemini-2.5-flash';

const optionalString = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

const optionalNumber = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const optionalDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (match) return { mimeType: match[1], base64: match[2] };
  return { mimeType: 'image/jpeg', base64: String(dataUrl || '').split(',')[1] || String(dataUrl || '') };
}

function stripJsonFence(text) {
  return String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function emptyExtraction() {
  return {
    supplier: {
      name: '',
      gstNumber: '',
      mobileNumber: '',
      address: '',
      city: '',
      state: '',
      pincode: ''
    },
    billNumber: '',
    billDate: '',
    voucherNumber: '',
    lineItems: [],
    taxableAmount: 0,
    discountAmount: 0,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    totalTaxAmount: 0,
    grandTotal: 0,
    extractedText: '',
    confidence: 'low',
    notes: ''
  };
}

function normalizeExtraction(raw) {
  const base = emptyExtraction();
  const lineItems = Array.isArray(raw?.lineItems) ? raw.lineItems : [];
  const normalizedLines = lineItems.map((line) => ({
    description: optionalString(line.description) || 'Item',
    hsnCode: optionalString(line.hsnCode),
    quantity: optionalNumber(line.quantity),
    cut: optionalNumber(line.cut),
    pcs: optionalNumber(line.pcs),
    unit: optionalString(line.unit) || 'pcs',
    rate: optionalNumber(line.rate),
    amount: optionalNumber(line.amount),
    remarks: optionalString(line.remarks)
  }));

  const taxableAmount = optionalNumber(raw?.taxableAmount) || normalizedLines.reduce((sum, line) => sum + optionalNumber(line.amount), 0);
  const cgstAmount = optionalNumber(raw?.cgstAmount);
  const sgstAmount = optionalNumber(raw?.sgstAmount);
  const igstAmount = optionalNumber(raw?.igstAmount);
  const totalTaxAmount = optionalNumber(raw?.totalTaxAmount) || cgstAmount + sgstAmount + igstAmount;

  return {
    ...base,
    supplier: {
      name: optionalString(raw?.supplier?.name) || '',
      gstNumber: optionalString(raw?.supplier?.gstNumber) || '',
      mobileNumber: optionalString(raw?.supplier?.mobileNumber) || '',
      address: optionalString(raw?.supplier?.address) || '',
      city: optionalString(raw?.supplier?.city) || '',
      state: optionalString(raw?.supplier?.state) || '',
      pincode: optionalString(raw?.supplier?.pincode) || ''
    },
    billNumber: optionalString(raw?.billNumber) || '',
    billDate: optionalString(raw?.billDate) || '',
    voucherNumber: optionalString(raw?.voucherNumber) || '',
    lineItems: normalizedLines,
    taxableAmount,
    discountAmount: optionalNumber(raw?.discountAmount),
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTaxAmount,
    grandTotal: optionalNumber(raw?.grandTotal) || taxableAmount + totalTaxAmount,
    extractedText: optionalString(raw?.extractedText) || '',
    confidence: optionalString(raw?.confidence) || 'medium',
    notes: optionalString(raw?.notes) || ''
  };
}

async function extractWithGemini(imageDataUrl) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('Gemini API key is not configured on backend. Set GEMINI_API_KEY to use bill extraction.');
    error.status = 400;
    throw error;
  }

  const { mimeType, base64 } = parseDataUrl(imageDataUrl);
  const prompt = `Extract structured purchase bill data from this Indian textile invoice image.
Return only valid JSON. Do not wrap in markdown.
Schema:
{
  "supplier": {
    "name": "supplier firm name",
    "gstNumber": "GSTIN",
    "mobileNumber": "mobile/phone if visible",
    "address": "address if visible",
    "city": "city",
    "state": "state",
    "pincode": "pincode"
  },
  "billNumber": "bill/invoice number",
  "billDate": "YYYY-MM-DD if possible",
  "voucherNumber": "voucher/accounting number if visible",
  "lineItems": [
    {
      "description": "item/product/design",
      "hsnCode": "HSN",
      "quantity": number,
      "cut": number,
      "pcs": number,
      "unit": "pcs/mtrs/cut",
      "rate": number,
      "amount": number,
      "remarks": "extra visible line details"
    }
  ],
  "taxableAmount": number,
  "discountAmount": number,
  "cgstAmount": number,
  "sgstAmount": number,
  "igstAmount": number,
  "totalTaxAmount": number,
  "grandTotal": number,
  "extractedText": "important raw text",
  "confidence": "high|medium|low",
  "notes": "uncertainties"
}
Focus on supplier name, GST number, mobile, invoice/bill number, items, HSN, quantity, cut, pcs, rate, amount, and final total.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload?.error?.message || `Gemini extraction failed (${response.status})`);
    error.status = 502;
    throw error;
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n') || '';
  if (!text.trim()) {
    const error = new Error('No extraction text returned from Gemini');
    error.status = 502;
    throw error;
  }

  return normalizeExtraction(JSON.parse(stripJsonFence(text)));
}

async function findOrCreateSupplierForBill(userId, supplierPayload) {
  return findOrCreateSupplier(prisma, userId, {
    name: optionalString(supplierPayload.name) || 'Unknown Supplier',
    gstNumber: optionalString(supplierPayload.gstNumber),
    mobileNumber: optionalString(supplierPayload.mobileNumber),
    address: optionalString(supplierPayload.address),
    city: optionalString(supplierPayload.city),
    state: optionalString(supplierPayload.state),
    pincode: optionalString(supplierPayload.pincode)
  });
}

router.post('/extract', authenticateToken, requireActiveSubscription, [
  body('imageDataUrl').notEmpty()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const extraction = await extractWithGemini(req.body.imageDataUrl);
    res.json({ extraction });
  } catch (error) {
    next(error);
  }
});

router.post('/bills', authenticateToken, requireActiveSubscription, [
  body('extraction').isObject()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const extraction = normalizeExtraction(req.body.extraction);
    const transactionType = normalizeTransactionType(
      req.body.transactionType || extraction.transactionType,
      DEFAULT_PURCHASE_TRANSACTION_TYPE
    );
    const supplier = await findOrCreateSupplierForBill(userId, extraction.supplier);
    const bill = await prisma.$transaction(async (tx) => {
      const typeBillNumber = await allocateNextTypeBillNumber(tx, userId, transactionType, 'purchase_bill');
      return tx.purchaseBill.create({
        data: {
          userId,
          supplierId: supplier.id,
          billNumber: optionalString(extraction.billNumber),
          billDate: optionalDate(extraction.billDate),
          voucherNumber: optionalString(extraction.voucherNumber),
          transactionType,
          typeBillNumber,
          image: optionalString(req.body.imageDataUrl),
          extractedText: optionalString(extraction.extractedText),
          extractionJson: extraction,
          lineItems: extraction.lineItems,
          taxableAmount: extraction.taxableAmount,
          discountAmount: extraction.discountAmount,
          cgstAmount: extraction.cgstAmount,
          sgstAmount: extraction.sgstAmount,
          igstAmount: extraction.igstAmount,
          totalTaxAmount: extraction.totalTaxAmount,
          grandTotal: extraction.grandTotal,
          status: 'posted'
        },
        include: { supplier: true }
      });
    });

    res.status(201).json({ supplier, bill });
  } catch (error) {
    next(error);
  }
});

router.get('/suppliers', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { userId: req.user.userId },
      include: {
        purchaseBills: {
          select: {
            id: true,
            grandTotal: true,
            billDate: true,
            createdAt: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json({
      suppliers: suppliers.map(supplier => ({
        ...supplier,
        billCount: supplier.purchaseBills.length,
        runningBalance: supplier.purchaseBills.reduce((sum, bill) => sum + bill.grandTotal, 0)
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/suppliers/:id/ledger', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const result = await buildSupplierLedger(prisma, req.user.userId, req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const ledger = result.ledger.map(entry => ({
      id: entry.sourceId,
      date: entry.date,
      billNumber: entry.billNumber,
      voucherNumber: entry.voucherNumber,
      account: entry.account,
      creditAmount: entry.creditAmount,
      debitAmount: entry.debitAmount,
      runningBalance: entry.runningBalance,
      status: 'posted',
      lineCount: entry.lineCount || 0
    }));

    res.json({
      supplier: result.supplier,
      ledger,
      runningBalance: result.runningBalance
    });
  } catch (error) {
    next(error);
  }
});

router.get('/bills/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const bill = await prisma.purchaseBill.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.userId
      },
      include: { supplier: true }
    });

    if (!bill) {
      return res.status(404).json({ error: 'Purchase bill not found' });
    }

    res.json({ bill });
  } catch (error) {
    next(error);
  }
});

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

router.get('/meta', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const ctx = await getCompanyContext(userId);
    const suppliers = await prisma.supplier.findMany({
      where: { userId },
      orderBy: { name: 'asc' }
    });
    const items = await prisma.salesItemMaster.findMany({
      where: { userId },
      orderBy: [{ mainScreen: 'asc' }, { name: 'asc' }]
    }).catch(() => []);
    res.json({ ...ctx, suppliers, items });
  } catch (error) {
    next(error);
  }
});

function buildManualBillData(req, supplier, ctx, lines, totals, typeBillNumber) {
  const transactionType = normalizeTransactionType(
    req.body.transactionType,
    DEFAULT_PURCHASE_TRANSACTION_TYPE
  );
  const partyGstin = optionalString(req.body.partyGstin) || supplier.gstNumber;
  const placeOfSupply = optionalString(req.body.state) || supplier.state || getStateFromGstin(partyGstin).stateName;
  const gstType = optionalString(req.body.gstType)
    || (ctx.businessState && placeOfSupply && isInterStateSupply(placeOfSupply, ctx.businessState)
      ? 'Inter-State Tax Inv.'
      : 'Local Tax Inv.');

  return {
    supplierId: supplier.id,
    billNumber: optionalString(req.body.supplierBillNo || req.body.billNumber),
    supplierBillNo: optionalString(req.body.supplierBillNo || req.body.billNumber),
    billDate: optionalDate(req.body.billDate || req.body.orderDate) || new Date(),
    voucherNumber: optionalString(req.body.voucherNumber) || (typeBillNumber != null ? String(typeBillNumber) : null),
    transactionType,
    typeBillNumber: typeBillNumber ?? undefined,
    companyName: optionalString(req.body.companyName) || ctx.companyName || null,
    partyGstin,
    partyMsme: optionalString(req.body.partyMsme) || supplier.msmeType || null,
    station: optionalString(req.body.station),
    agentName: optionalString(req.body.brokerName || req.body.agentName),
    haste: optionalString(req.body.haste),
    hasteGstin: optionalString(req.body.hasteGstin),
    transportName: optionalString(req.body.transportName),
    lrNo: optionalString(req.body.lrNo),
    vehicleNo: optionalString(req.body.vehicleNo),
    gstType,
    dhara: optionalNumber(req.body.dhara),
    grace: optionalNumber(req.body.grace),
    screenSeries: optionalString(req.body.screenSeries),
    remarks: optionalString(req.body.remarks),
    challanNo: optionalString(req.body.challanNo),
    orderRef: optionalString(req.body.orderRef || req.body.orderNumber),
    purchaseAccount: optionalString(req.body.purchaseAccount || req.body.purAccount),
    lineItems: lines,
    taxableAmount: totals.taxableAmount,
    discountAmount: totals.discountAmount,
    cgstAmount: totals.cgstAmount,
    sgstAmount: totals.sgstAmount,
    igstAmount: totals.igstAmount,
    totalTaxAmount: totals.totalTaxAmount,
    grandTotal: totals.netAmount,
    status: 'posted'
  };
}

async function saveManualBill(req, res, existing = null) {
  const userId = req.user.userId;
  const ctx = await getCompanyContext(userId);
  const supplier = await resolveSupplierForEntry(prisma, userId, {
    supplierId: req.body.supplierId,
    partyName: req.body.partyName || req.body.supplierName,
    partyGstin: req.body.partyGstin,
    placeOfSupply: req.body.state,
    partyMsme: req.body.partyMsme
  });
  if (!supplier) return res.status(400).json({ error: 'Party / supplier is required' });

  const partyGstin = optionalString(req.body.partyGstin) || supplier.gstNumber;
  const placeOfSupply = optionalString(req.body.state) || supplier.state || getStateFromGstin(partyGstin).stateName;
  const transactionType = normalizeTransactionType(
    req.body.transactionType,
    DEFAULT_PURCHASE_TRANSACTION_TYPE
  );
  const typeGst = getGstDefaultsForTransactionType(
    transactionType,
    ctx.defaultGstRate,
    ctx.defaultHsnCode || '5407'
  );
  const lines = normalizeErpLines(req.body.lineItems, {
    defaultGstRate: typeGst.gstRate,
    defaultHsnCode: typeGst.hsnCode,
    placeOfSupply,
    businessState: ctx.businessState
  });
  if (!lines.length) return res.status(400).json({ error: 'Add at least one purchase line' });
  const totals = aggregateErpLines(lines);

  const bill = await prisma.$transaction(async (tx) => {
    if (existing) {
      const data = buildManualBillData(req, supplier, ctx, lines, totals, existing.typeBillNumber);
      delete data.typeBillNumber;
      return tx.purchaseBill.update({
        where: { id: existing.id },
        data,
        include: { supplier: true }
      });
    }
    const typeBillNumber = await allocateNextTypeBillNumber(tx, userId, transactionType, 'purchase_bill');
    const data = buildManualBillData(req, supplier, ctx, lines, totals, typeBillNumber);
    return tx.purchaseBill.create({
      data: { ...data, userId },
      include: { supplier: true }
    });
  });

  res.status(existing ? 200 : 201).json({ bill, supplier, totals });
}

router.post('/entries', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    await saveManualBill(req, res, null);
  } catch (error) {
    next(error);
  }
});

router.put('/entries/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const existing = await prisma.purchaseBill.findFirst({
      where: { id: req.params.id, userId: req.user.userId }
    });
    if (!existing) return res.status(404).json({ error: 'Purchase bill not found' });
    await saveManualBill(req, res, existing);
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

    const where = {
      userId: req.user.userId,
      status: 'posted'
    };
    if (docType === 'return') {
      where.transactionType = { contains: 'PURCHASE RETURN', mode: 'insensitive' };
    } else if (docType === 'both') {
      where.OR = [
        { transactionType: { startsWith: 'FINISH PURCHASE', mode: 'insensitive' } },
        { transactionType: { contains: 'PURCHASE RETURN', mode: 'insensitive' } },
        { transactionType: null }
      ];
    } else {
      where.AND = [
        {
          OR: [
            { transactionType: { startsWith: 'FINISH PURCHASE', mode: 'insensitive' } },
            { transactionType: null },
            { transactionType: '' }
          ]
        },
        { NOT: { transactionType: { contains: 'PURCHASE RETURN', mode: 'insensitive' } } }
      ];
    }
    if (brokerName) where.agentName = { contains: brokerName, mode: 'insensitive' };
    if (transportName) where.transportName = { contains: transportName, mode: 'insensitive' };
    if (station) where.station = { contains: station, mode: 'insensitive' };
    if (haste) where.haste = { contains: haste, mode: 'insensitive' };
    if (fromDate || toDateValue) {
      where.billDate = {};
      if (fromDate) where.billDate.gte = optionalDate(fromDate);
      if (toDateValue) {
        const end = optionalDate(toDateValue) || new Date();
        end.setHours(23, 59, 59, 999);
        where.billDate.lte = end;
      }
    }

    const bills = await prisma.purchaseBill.findMany({
      where,
      include: { supplier: true },
      orderBy: [{ billDate: 'desc' }, { createdAt: 'desc' }]
    });

    const filtered = partyName
      ? bills.filter(bill => String(bill.supplier?.name || '').toLowerCase().includes(partyName.toLowerCase()))
      : bills;

    if (view === 'detailed') {
      const rows = [];
      for (const bill of filtered) {
        const lines = Array.isArray(bill.lineItems) ? bill.lineItems : [];
        for (const [index, line] of lines.entries()) {
          const lineMain = line.mainScreen || line.category || '';
          const lineName = line.itemName || line.screenName || line.description || '';
          if (mainScreen
            && !String(lineMain).toLowerCase().includes(mainScreen.toLowerCase())
            && !String(lineName).toLowerCase().includes(mainScreen.toLowerCase())) continue;
          rows.push({
            id: `${bill.id}-${index}`,
            billId: bill.id,
            date: bill.billDate || bill.createdAt,
            partyName: bill.supplier?.name || '',
            billNo: bill.typeBillNumber || bill.billNumber,
            transactionType: bill.transactionType || 'FINISH PURCHASE',
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

    const registerBills = mainScreen
      ? filtered.filter(bill => {
          const lines = Array.isArray(bill.lineItems) ? bill.lineItems : [];
          return lines.some(line => {
            const lineMain = String(line.mainScreen || line.category || '');
            const lineName = String(line.itemName || line.screenName || line.description || '');
            return lineMain.toLowerCase().includes(mainScreen.toLowerCase())
              || lineName.toLowerCase().includes(mainScreen.toLowerCase());
          });
        })
      : filtered;

    const rows = registerBills.map(bill => {
      const lines = Array.isArray(bill.lineItems) ? bill.lineItems : [];
      const pcs = roundMoney(lines.reduce((sum, line) => sum + (Number(line.pcs ?? line.quantity) || 0), 0));
      const mts = roundMoney(lines.reduce((sum, line) => sum + (Number(line.mtsQty) || 0), 0));
      const gross = roundMoney(lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0));
      return {
        id: bill.id,
        billId: bill.id,
        date: bill.billDate || bill.createdAt,
        partyName: bill.supplier?.name || '',
        transactionType: bill.transactionType || 'FINISH PURCHASE',
        voucherNo: bill.typeBillNumber || bill.voucherNumber,
        billNo: bill.supplierBillNo || bill.billNumber || bill.typeBillNumber,
        lrNo: bill.lrNo || '',
        transportName: bill.transportName || '',
        orderRef: bill.orderRef || '',
        pcs,
        mts,
        grossAmount: gross,
        taxableAmount: bill.taxableAmount,
        ledgerAmount: bill.grandTotal,
        invoiceValue: bill.grandTotal,
        discountAmount: bill.discountAmount,
        brokerName: bill.agentName || '',
        haste: bill.haste || '',
        station: bill.station || ''
      };
    });
    const totals = rows.reduce((acc, row) => {
      for (const key of ['pcs', 'mts', 'grossAmount', 'taxableAmount', 'ledgerAmount', 'invoiceValue', 'discountAmount']) {
        acc[key] = roundMoney(acc[key] + (Number(row[key]) || 0));
      }
      return acc;
    }, { pcs: 0, mts: 0, grossAmount: 0, taxableAmount: 0, ledgerAmount: 0, invoiceValue: 0, discountAmount: 0 });
    res.json({ view: 'register', docType, rows, totals });
  } catch (error) {
    next(error);
  }
});

router.get('/expense-report', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const fromDate = optionalString(req.query.fromDate);
    const toDateValue = optionalString(req.query.toDate);
    const partyName = optionalString(req.query.partyName);
    const brokerName = optionalString(req.query.brokerName);
    const transportName = optionalString(req.query.transportName);
    const station = optionalString(req.query.station);
    const purchaseAccount = optionalString(req.query.purchaseAccount);
    const mainScreen = optionalString(req.query.mainScreen);
    const view = (optionalString(req.query.view) || 'register').toLowerCase();
    const docType = optionalString(req.query.docType);

    const where = {
      userId: req.user.userId,
      status: 'posted',
      transactionType: docType && isExpensePurchaseType(docType)
        ? docType
        : { in: [...EXPENSE_TRANSACTION_TYPES] }
    };
    if (brokerName) where.agentName = { contains: brokerName, mode: 'insensitive' };
    if (transportName) where.transportName = { contains: transportName, mode: 'insensitive' };
    if (station) where.station = { contains: station, mode: 'insensitive' };
    if (purchaseAccount) where.purchaseAccount = { contains: purchaseAccount, mode: 'insensitive' };
    if (fromDate || toDateValue) {
      where.billDate = {};
      if (fromDate) where.billDate.gte = optionalDate(fromDate);
      if (toDateValue) {
        const end = optionalDate(toDateValue) || new Date();
        end.setHours(23, 59, 59, 999);
        where.billDate.lte = end;
      }
    }

    const bills = await prisma.purchaseBill.findMany({
      where,
      include: { supplier: true },
      orderBy: [{ billDate: 'desc' }, { createdAt: 'desc' }]
    });

    const filtered = partyName
      ? bills.filter(bill => String(bill.supplier?.name || '').toLowerCase().includes(partyName.toLowerCase()))
      : bills;

    if (view === 'detailed') {
      const rows = [];
      for (const bill of filtered) {
        const lines = Array.isArray(bill.lineItems) ? bill.lineItems : [];
        for (const [index, line] of lines.entries()) {
          const lineMain = line.mainScreen || line.category || '';
          const lineName = line.itemName || line.screenName || line.description || '';
          if (mainScreen
            && !String(lineMain).toLowerCase().includes(mainScreen.toLowerCase())
            && !String(lineName).toLowerCase().includes(mainScreen.toLowerCase())) continue;
          rows.push({
            id: `${bill.id}-${index}`,
            billId: bill.id,
            date: bill.billDate || bill.createdAt,
            partyName: bill.supplier?.name || '',
            billNo: bill.typeBillNumber || bill.billNumber,
            transactionType: bill.transactionType || '',
            purchaseAccount: bill.purchaseAccount || '',
            mainScreen: lineMain,
            itemName: lineName,
            pcs: Number(line.pcs ?? line.quantity) || 0,
            cut: Number(line.cut) || 0,
            mts: Number(line.mtsQty) || 0,
            rate: Number(line.rate) || 0,
            grossAmount: Number(line.amount) || 0,
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
      return res.json({ view: 'detailed', rows, totals });
    }

    const rows = filtered.map(bill => {
      const lines = Array.isArray(bill.lineItems) ? bill.lineItems : [];
      const pcs = roundMoney(lines.reduce((sum, line) => sum + (Number(line.pcs ?? line.quantity) || 0), 0));
      const mts = roundMoney(lines.reduce((sum, line) => sum + (Number(line.mtsQty) || 0), 0));
      const gross = roundMoney(lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0));
      return {
        id: bill.id,
        billId: bill.id,
        date: bill.billDate || bill.createdAt,
        partyName: bill.supplier?.name || '',
        transactionType: bill.transactionType || '',
        purchaseAccount: bill.purchaseAccount || '',
        voucherNo: bill.typeBillNumber || bill.voucherNumber,
        billNo: bill.supplierBillNo || bill.billNumber || bill.typeBillNumber,
        lrNo: bill.lrNo || '',
        transportName: bill.transportName || '',
        orderRef: bill.orderRef || '',
        pcs,
        mts,
        grossAmount: gross,
        taxableAmount: bill.taxableAmount,
        ledgerAmount: bill.grandTotal,
        invoiceValue: bill.grandTotal,
        discountAmount: bill.discountAmount,
        brokerName: bill.agentName || '',
        station: bill.station || ''
      };
    });
    const totals = rows.reduce((acc, row) => {
      for (const key of ['pcs', 'mts', 'grossAmount', 'taxableAmount', 'ledgerAmount', 'invoiceValue', 'discountAmount']) {
        acc[key] = roundMoney(acc[key] + (Number(row[key]) || 0));
      }
      return acc;
    }, { pcs: 0, mts: 0, grossAmount: 0, taxableAmount: 0, ledgerAmount: 0, invoiceValue: 0, discountAmount: 0 });
    res.json({ view: 'register', rows, totals });
  } catch (error) {
    next(error);
  }
});

export default router;
