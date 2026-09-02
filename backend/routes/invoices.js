import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { publicImageRef } from '../utils/designImages.js';

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

const normalizeTaxId = (value) => String(value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

function getCompanyTaxSaveError(gstValue, panValue) {
  const gst = normalizeTaxId(gstValue);
  const pan = normalizeTaxId(panValue);

  if (pan && (pan.length !== 10 || !PAN_REGEX.test(pan))) {
    return 'Wrong PAN number';
  }

  if (gst.length === 15 && pan.length === 10 && gst.slice(2, 12) !== pan) {
    return 'Wrong GST number';
  }

  return null;
}

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const normalizeState = (value) =>
  optionalString(value)?.toLowerCase().replace(/[^a-z0-9]/g, '') || null;

const getFinancialYearCode = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
};

const getFinancialYearRange = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  return {
    start: new Date(Date.UTC(startYear, 3, 1, 0, 0, 0)),
    end: new Date(Date.UTC(startYear + 1, 3, 1, 0, 0, 0))
  };
};

const invoiceInclude = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      createdAt: true
    }
  },
  customer: true
};

function getProfilePayload(body, user) {
  return {
    legalName: optionalString(body.legalName) || optionalString(user.firmName) || optionalString(user.name),
    tradeName: optionalString(body.tradeName) || optionalString(user.firmName),
    companyCode: optionalString(body.companyCode),
    companyType: optionalString(body.companyType),
    companyGroup: optionalString(body.companyGroup),
    gstNumber: optionalString(body.gstNumber),
    panNumber: optionalString(body.panNumber),
    udyamNumber: optionalString(body.udyamNumber),
    tdsAccountNumber: optionalString(body.tdsAccountNumber),
    msmeType: optionalString(body.msmeType),
    addressLine1: optionalString(body.addressLine1),
    addressLine2: optionalString(body.addressLine2),
    city: optionalString(body.city),
    state: optionalString(body.state),
    pincode: optionalString(body.pincode),
    phone: optionalString(body.phone),
    mobileNumber: optionalString(body.mobileNumber),
    fax: optionalString(body.fax),
    email: optionalString(body.email) || optionalString(user.email),
    bankName: optionalString(body.bankName),
    bankAccount: optionalString(body.bankAccount),
    bankIfsc: optionalString(body.bankIfsc),
    rtgsAccount: optionalString(body.rtgsAccount),
    businessDescription: optionalString(body.businessDescription),
    proprietor: optionalString(body.proprietor),
    invoicePrefix: optionalString(body.invoicePrefix) || 'TX',
    defaultHsnCode: optionalString(body.defaultHsnCode),
    defaultGstRate: optionalNumber(body.defaultGstRate) ?? 5,
    terms: optionalString(body.terms)
  };
}

async function getOrCreateBusinessProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      firmName: true,
      businessProfile: true
    }
  });

  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  if (user.businessProfile) return { user, profile: user.businessProfile };

  const profile = await prisma.businessProfile.create({
    data: {
      userId,
      legalName: user.firmName || user.name || null,
      tradeName: user.firmName || null,
      email: user.email || null
    }
  });

  return { user, profile };
}

async function generateInvoiceNumber(tx, userId, prefix, invoiceDate) {
  const cleanPrefix = (prefix || 'TX').replace(/[^A-Z0-9-]/gi, '').toUpperCase() || 'TX';
  const fyCode = getFinancialYearCode(invoiceDate);
  const { start, end } = getFinancialYearRange(invoiceDate);
  const count = await tx.salesInvoice.count({
    where: {
      userId,
      invoiceDate: {
        gte: start,
        lt: end
      }
    }
  });
  return `${cleanPrefix}/${fyCode}/${String(count + 1).padStart(4, '0')}`;
}

function buildOrderLines(order, defaultHsnCode, defaultGstRate) {
  const rawLines = Array.isArray(order.orderLines) ? order.orderLines : [];
  if (rawLines.length > 0) {
    return rawLines.map((line) => ({
      sourceDesignId: line.designId || null,
      description: line.designCode || line.designName || 'Design',
      designName: line.designName || null,
      designCode: line.designCode || null,
      fabric: line.fabric || null,
      image: publicImageRef(line.image) || null,
      hsnCode: defaultHsnCode || null,
      quantity: parseInt(line.quantity, 10) || 0,
      unit: 'pcs',
      rate: Number(line.basePrice ?? line.retailPrice ?? 0) || 0,
      gstRate: defaultGstRate,
      remarks: line.remarks || null
    }));
  }

  if (order.design) {
    return [{
      sourceDesignId: order.designId || order.design.id,
      description: order.design.designCode || order.design.name || 'Design',
      designName: order.design.name || null,
      designCode: order.design.designCode || null,
      fabric: order.design.fabric || null,
      image: publicImageRef(order.design.imageFull || order.design.imageThumb) || null,
      hsnCode: defaultHsnCode || null,
      quantity: order.quantity || 0,
      unit: order.design.stockUnit || 'pcs',
      rate: Number(order.design.basePrice ?? order.design.retailPrice ?? 0) || 0,
      gstRate: defaultGstRate,
      remarks: order.remarks || null
    }];
  }

  return [{
    sourceDesignId: null,
    description: order.manualType === 'open' ? 'Open parcel order' : 'Order item',
    designName: null,
    designCode: null,
    fabric: null,
    image: null,
    hsnCode: defaultHsnCode || null,
    quantity: order.quantity || 0,
    unit: order.manualType === 'open' ? 'parcel' : 'pcs',
    rate: 0,
    gstRate: defaultGstRate,
    remarks: order.remarks || null
  }];
}

function buildInvoicePayload({ order, profile, invoiceDate, hsnCode, gstRate, placeOfSupply, notes }) {
  const defaultGstRate = optionalNumber(gstRate) ?? profile.defaultGstRate ?? 5;
  const defaultHsnCode = optionalString(hsnCode) || profile.defaultHsnCode || null;
  const discountRate = Number(order.discountRate || 0);
  const shippingCharge = roundMoney(order.shippingCharge || 0);
  const lines = buildOrderLines(order, defaultHsnCode, defaultGstRate);
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + (line.quantity * line.rate), 0));
  const discountAmount = roundMoney(subtotal * Math.max(discountRate, 0) / 100);
  const taxableBeforeRounding = Math.max(subtotal - discountAmount, 0);
  const sellerState = normalizeState(profile.state);
  const resolvedPlaceOfSupply = optionalString(placeOfSupply) || order.customer?.state || null;
  const buyerState = normalizeState(resolvedPlaceOfSupply);
  const isSameState = sellerState && buyerState && sellerState === buyerState;
  const totalBase = subtotal || 1;

  const lineItems = lines.map((line) => {
    const grossAmount = roundMoney(line.quantity * line.rate);
    const lineDiscount = roundMoney(discountAmount * (grossAmount / totalBase));
    const taxableAmount = roundMoney(Math.max(grossAmount - lineDiscount, 0));
    const taxAmount = roundMoney(taxableAmount * (line.gstRate || 0) / 100);
    const cgstAmount = isSameState ? roundMoney(taxAmount / 2) : 0;
    const sgstAmount = isSameState ? roundMoney(taxAmount / 2) : 0;
    const igstAmount = isSameState ? 0 : taxAmount;

    return {
      ...line,
      grossAmount,
      discountAmount: lineDiscount,
      taxableAmount,
      cgstRate: isSameState ? roundMoney((line.gstRate || 0) / 2) : 0,
      sgstRate: isSameState ? roundMoney((line.gstRate || 0) / 2) : 0,
      igstRate: isSameState ? 0 : line.gstRate || 0,
      cgstAmount,
      sgstAmount,
      igstAmount,
      taxAmount,
      totalAmount: roundMoney(taxableAmount + taxAmount)
    };
  });

  const taxableAmount = roundMoney(lineItems.reduce((sum, line) => sum + line.taxableAmount, 0));
  const cgstAmount = roundMoney(lineItems.reduce((sum, line) => sum + line.cgstAmount, 0));
  const sgstAmount = roundMoney(lineItems.reduce((sum, line) => sum + line.sgstAmount, 0));
  const igstAmount = roundMoney(lineItems.reduce((sum, line) => sum + line.igstAmount, 0));
  const totalTaxAmount = roundMoney(cgstAmount + sgstAmount + igstAmount);
  const grandTotal = roundMoney(taxableAmount + totalTaxAmount + shippingCharge);

  return {
    invoiceDate,
    sellerSnapshot: {
      legalName: profile.legalName,
      tradeName: profile.tradeName,
      gstNumber: profile.gstNumber,
      panNumber: profile.panNumber,
      addressLine1: profile.addressLine1,
      addressLine2: profile.addressLine2,
      city: profile.city,
      state: profile.state,
      pincode: profile.pincode,
      phone: profile.phone,
      email: profile.email,
      bankName: profile.bankName,
      bankAccount: profile.bankAccount,
      bankIfsc: profile.bankIfsc,
      terms: profile.terms
    },
    buyerSnapshot: {
      name: order.customer?.organizationName || order.buyerName,
      gstNumber: order.customer?.gstNumber || null,
      contactPersonName: order.customer?.contactPersonName || null,
      mobileNumber: order.customer?.mobileNumber || order.buyerPhone || null,
      state: order.customer?.state || null,
      city: order.customer?.city || null,
      pincode: order.customer?.pincode || null
    },
    lineItems,
    placeOfSupply: resolvedPlaceOfSupply,
    taxableAmount,
    discountAmount,
    shippingCharge,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTaxAmount,
    grandTotal,
    amountDue: grandTotal,
    notes: optionalString(notes)
  };
}

router.get('/profile', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const { profile } = await getOrCreateBusinessProfile(req.user.userId);
    res.json({ profile });
  } catch (error) {
    next(error);
  }
});

router.put('/profile', authenticateToken, requireActiveSubscription, [
  body('defaultGstRate').optional().isFloat({ min: 0 }),
  body('invoicePrefix').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { user } = await getOrCreateBusinessProfile(req.user.userId);
    const taxError = getCompanyTaxSaveError(req.body.gstNumber, req.body.panNumber);
    if (taxError) {
      return res.status(400).json({ error: taxError });
    }
    const payload = getProfilePayload(req.body, user);
    const profile = await prisma.businessProfile.upsert({
      where: { userId: req.user.userId },
      update: payload,
      create: {
        userId: req.user.userId,
        ...payload
      }
    });

    res.json({ profile });
  } catch (error) {
    next(error);
  }
});

router.get('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const invoices = await prisma.salesInvoice.findMany({
      where: { userId: req.user.userId },
      include: invoiceInclude,
      orderBy: { invoiceDate: 'desc' }
    });
    res.json({ invoices });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const invoice = await prisma.salesInvoice.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.userId
      },
      include: invoiceInclude
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ invoice });
  } catch (error) {
    next(error);
  }
});

router.post('/from-order/:orderId', authenticateToken, requireActiveSubscription, [
  body('invoiceDate').optional().isISO8601(),
  body('defaultGstRate').optional().isFloat({ min: 0 }),
  body('defaultHsnCode').optional().trim(),
  body('placeOfSupply').optional().trim(),
  body('notes').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const existingInvoice = await prisma.salesInvoice.findFirst({
      where: {
        userId,
        orderId: req.params.orderId
      },
      include: invoiceInclude
    });

    if (existingInvoice) {
      return res.json({ invoice: existingInvoice, existing: true });
    }

    const order = await prisma.order.findFirst({
      where: {
        id: req.params.orderId,
        userId
      },
      include: {
        customer: true,
        design: {
          select: {
            id: true,
            name: true,
            designCode: true,
            fabric: true,
            stockUnit: true,
            basePrice: true,
            retailPrice: true,
            imageThumb: true,
            imageFull: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!['pending', 'completed'].includes(order.status)) {
      return res.status(400).json({ error: 'Approve the order before generating an invoice' });
    }

    const { profile } = await getOrCreateBusinessProfile(userId);
    const invoiceDate = req.body.invoiceDate ? new Date(req.body.invoiceDate) : new Date();
    const payload = buildInvoicePayload({
      order,
      profile,
      invoiceDate,
      hsnCode: req.body.defaultHsnCode,
      gstRate: req.body.defaultGstRate,
      placeOfSupply: req.body.placeOfSupply,
      notes: req.body.notes
    });

    const invoice = await prisma.$transaction(async (tx) => {
      const invoiceNumber = await generateInvoiceNumber(tx, userId, profile.invoicePrefix, invoiceDate);
      return tx.salesInvoice.create({
        data: {
          userId,
          orderId: order.id,
          customerId: order.customerId || null,
          invoiceNumber,
          ...payload
        },
        include: invoiceInclude
      });
    });

    res.status(201).json({ invoice, existing: false });
  } catch (error) {
    next(error);
  }
});

export default router;
