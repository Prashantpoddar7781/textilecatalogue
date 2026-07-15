import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { allocateNextInvoiceNumber } from '../utils/orderBilling.js';
import { normalizeTransactionType, DEFAULT_SALES_TRANSACTION_TYPE } from '../constants/erpTransactionTypes.js';
import { allocateNextTypeBillNumber } from '../utils/transactionBilling.js';
import { resolveCustomerForEntry } from '../utils/partyMaster.js';

const router = express.Router();
const prisma = new PrismaClient();

const ORDER_STATUSES = ['waiting_approval', 'pending', 'completed'];

const orderInclude = {
  customer: true,
  design: {
    select: {
      id: true,
      name: true,
      image: true,
      fabric: true
    }
  },
  shareLink: {
    select: {
      id: true,
      token: true
    }
  }
};

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

const optionalDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeOrderLines = (orderLines) => {
  if (!Array.isArray(orderLines)) return [];
  return orderLines.map((line) => ({
    ...line,
    completed: Boolean(line?.completed),
    completedAt: line?.completedAt || null
  }));
};

async function decrementCompletedLineStock(tx, line) {
  if (!line?.designId) return;
  const design = await tx.design.findUnique({
    where: { id: line.designId }
  });
  if (!design) return;

  const currentStock = design.stockQuantity ?? 0;
  const quantity = parseInt(line.quantity, 10);
  const newStock = currentStock - (Number.isFinite(quantity) ? quantity : 0);
  await tx.design.update({
    where: { id: line.designId },
    data: { stockQuantity: newStock }
  });
}

const getOrderMeta = (body) => ({
  priceCategory: optionalString(body.priceCategory),
  orderNumber: optionalString(body.orderNumber),
  transactionType: normalizeTransactionType(body.transactionType, DEFAULT_SALES_TRANSACTION_TYPE),
  agentName: optionalString(body.agentName),
  transportName: optionalString(body.transportName),
  haste: optionalString(body.haste),
  station: optionalString(body.station),
  discountRate: optionalNumber(body.discountRate),
  shippingCharge: optionalNumber(body.shippingCharge),
  orderDate: optionalDate(body.orderDate),
  expectedDate: optionalDate(body.expectedDate)
});

async function allocateOrderNumbers(tx, userId, transactionType) {
  const type = normalizeTransactionType(transactionType, DEFAULT_SALES_TRANSACTION_TYPE);
  const [invoiceNumber, typeBillNumber] = await Promise.all([
    allocateNextInvoiceNumber(tx, userId),
    allocateNextTypeBillNumber(tx, userId, type, 'order')
  ]);
  return { invoiceNumber, transactionType: type, typeBillNumber };
}

async function resolveManualCustomer(userId, body) {
  if (body.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: body.customerId, userId }
    });
    if (!customer) {
      const error = new Error('Customer not found or not yours');
      error.status = 400;
      throw error;
    }
    return {
      customerId: customer.id,
      buyerName: customer.organizationName,
      buyerPhone: customer.mobileNumber || '-',
      customer
    };
  }

  if (body.customer) {
    const organizationName = optionalString(body.customer.organizationName);
    if (!organizationName) {
      return {
        customerId: null,
        buyerName: optionalString(body.buyerName) || 'Walk-in customer',
        buyerPhone: optionalString(body.buyerPhone) || '-',
        customer: null
      };
    }
    const customer = await prisma.customer.create({
      data: {
        userId,
        organizationName,
        gstNumber: optionalString(body.customer.gstNumber),
        contactPersonName: optionalString(body.customer.contactPersonName),
        mobileNumber: optionalString(body.customer.mobileNumber),
        agentName: optionalString(body.customer.agentName),
        category: optionalString(body.customer.category),
        state: optionalString(body.customer.state),
        city: optionalString(body.customer.city),
        pincode: optionalString(body.customer.pincode),
        discountRate: optionalNumber(body.customer.discountRate)
      }
    });
    return {
      customerId: customer.id,
      buyerName: customer.organizationName,
      buyerPhone: customer.mobileNumber || '-',
      customer
    };
  }

  const buyerName = optionalString(body.buyerName);
  if (buyerName) {
    const customer = await resolveCustomerForEntry(prisma, userId, {
      buyerName,
      state: optionalString(body.state),
      agentName: optionalString(body.agentName)
    });
    if (customer) {
      return {
        customerId: customer.id,
        buyerName: customer.organizationName,
        buyerPhone: customer.mobileNumber || '-',
        customer
      };
    }
  }

  return {
    customerId: null,
    buyerName: buyerName || 'Walk-in customer',
    buyerPhone: optionalString(body.buyerPhone) || '-',
    customer: null
  };
}

// Public: create order from share link token
router.post('/public', [
  body('token').notEmpty(),
  body('designId').notEmpty(),
  body('buyerName').notEmpty().trim(),
  body('buyerPhone').optional().trim(),
  body('orderSessionId').optional().trim(),
  body('quantity').isInt({ min: 1 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, designId, buyerName, buyerPhone, orderSessionId, quantity } = req.body;
    const normalizedBuyerName = optionalString(buyerName);
    const normalizedPhone = optionalString(buyerPhone) || '-';
    const normalizedSessionId = optionalString(orderSessionId);
    const publicBatchId = normalizedSessionId ? `share_${token}_${normalizedSessionId}` : null;
    const parsedQuantity = parseInt(quantity, 10);

    const shareLink = await prisma.shareLink.findUnique({
      where: { token },
      include: {
        designs: {
          select: { designId: true }
        }
      }
    });

    if (!shareLink) {
      return res.status(404).json({ error: 'Share link not found' });
    }
    if (!shareLink.isActive) {
      return res.status(403).json({ error: 'Share link is disabled' });
    }
    if (shareLink.expiresAt && new Date() > new Date(shareLink.expiresAt)) {
      return res.status(403).json({ error: 'Share link has expired' });
    }

    const allowedDesignIds = shareLink.designs?.map(d => d.designId) || [];
    const isAllowed = allowedDesignIds.length > 0
      ? allowedDesignIds.includes(designId)
      : (shareLink.designId === designId);

    if (!isAllowed) {
      return res.status(400).json({ error: 'Design is not part of this link' });
    }

    const design = await prisma.design.findFirst({
      where: {
        id: designId,
        userId: shareLink.userId
      },
      select: {
        id: true,
        name: true,
        designCode: true,
        image: true,
        fabric: true,
        basePrice: true,
        retailPrice: true
      }
    });

    if (!design) {
      return res.status(400).json({ error: 'Design not found' });
    }

    const newLine = {
      designId,
      designName: design.name || 'Untitled Design',
      designCode: design.designCode || null,
      image: design.image,
      fabric: design.fabric,
      basePrice: design.basePrice || design.retailPrice || 0,
      retailPrice: design.retailPrice || design.basePrice || 0,
      quantity: parsedQuantity,
      remarks: null,
      completed: false,
      completedAt: null
    };

    let existingOrder = null;
    if (publicBatchId) {
      existingOrder = await prisma.order.findFirst({
        where: {
          userId: shareLink.userId,
          shareLinkId: shareLink.id,
          manualBatchId: publicBatchId,
          status: 'waiting_approval'
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    if (existingOrder) {
      const existingLines = normalizeOrderLines(existingOrder.orderLines);
      const lineIndex = existingLines.findIndex(line => line.designId === designId);
      const nextLines = lineIndex >= 0
        ? existingLines.map((line, index) => index === lineIndex
          ? { ...line, quantity: parseInt(line.quantity, 10) + parsedQuantity }
          : line
        )
        : [...existingLines, newLine];
      const totalQuantity = nextLines.reduce((sum, line) => sum + parseInt(line.quantity, 10), 0);

      const order = await prisma.order.update({
        where: { id: existingOrder.id },
        data: {
          buyerName: normalizedBuyerName,
          buyerPhone: normalizedPhone,
          quantity: totalQuantity,
          orderLines: nextLines
        },
        include: orderInclude
      });

      return res.status(200).json({ order });
    }

    const order = await prisma.$transaction(async (tx) => {
      const billing = await allocateOrderNumbers(tx, shareLink.userId, DEFAULT_SALES_TRANSACTION_TYPE);
      return tx.order.create({
        data: {
          userId: shareLink.userId,
          shareLinkId: shareLink.id,
          designId,
          buyerName: normalizedBuyerName,
          buyerPhone: normalizedPhone,
          quantity: parsedQuantity,
          orderLines: [newLine],
          manualBatchId: publicBatchId,
          ...billing,
          status: 'waiting_approval'
        },
        include: orderInclude
      });
    });

    res.status(201).json({ order });
  } catch (error) {
    next(error);
  }
});

// Auth: create manual order (open parcel or design lines)
router.post('/manual', authenticateToken, requireActiveSubscription, [
  body('kind').isIn(['open', 'design']),
  body('buyerName').optional().trim(),
  body('customerId').optional().trim(),
  body('customer').optional().isObject(),
  body('remarks').optional().trim(),
  body('parcelQuantity').optional().isInt({ min: 1 }),
  body('lines').optional().isArray()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const { kind, remarks } = req.body;
    const customerRef = await resolveManualCustomer(userId, req.body);
    const orderMeta = getOrderMeta(req.body);

    if (kind === 'open') {
      const qty = parseInt(req.body.parcelQuantity, 10);
      if (!Number.isFinite(qty) || qty < 1) {
        return res.status(400).json({ error: 'parcelQuantity is required and must be at least 1' });
      }

      const order = await prisma.$transaction(async (tx) => {
        const billing = await allocateOrderNumbers(tx, userId, orderMeta.transactionType);
        return tx.order.create({
          data: {
            userId,
            shareLinkId: null,
            designId: null,
            customerId: customerRef.customerId,
            buyerName: customerRef.buyerName,
            buyerPhone: customerRef.buyerPhone,
            quantity: qty,
            remarks: remarks?.trim() || null,
            manualType: 'open',
            status: 'waiting_approval',
            ...orderMeta,
            ...billing
          },
          include: orderInclude
        });
      });

      return res.status(201).json({ order });
    }

    const lines = req.body.lines;
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'Design order requires at least one line with designId and quantity' });
    }

    const batchId = randomUUID();
    const orderLines = [];
    let primaryDesignId = null;
    let totalQuantity = 0;
    const parsedLines = [];

    for (const line of lines) {
      const designId = line?.designId;
      const quantity = parseInt(line?.quantity, 10);
      if (!designId || !Number.isFinite(quantity) || quantity < 1) {
        return res.status(400).json({ error: 'Each line needs designId and quantity (min 1)' });
      }
      parsedLines.push({
        designId,
        quantity,
        remarks: optionalString(line?.remarks)
      });
    }

    const designs = await prisma.design.findMany({
      where: {
        userId,
        id: { in: [...new Set(parsedLines.map(line => line.designId))] }
      },
      select: {
        id: true,
        name: true,
        designCode: true,
        image: true,
        fabric: true,
        basePrice: true,
        retailPrice: true
      }
    });
    const designById = new Map(designs.map(design => [design.id, design]));

    for (const line of parsedLines) {
      const design = designById.get(line.designId);
      if (!design) {
        return res.status(400).json({ error: `Design not found or not yours: ${line.designId}` });
      }

      if (!primaryDesignId) primaryDesignId = line.designId;
      totalQuantity += line.quantity;
      orderLines.push({
        designId: line.designId,
        designName: design.name || 'Untitled Design',
        designCode: design.designCode || null,
        image: design.image,
        fabric: design.fabric,
        basePrice: design.basePrice || design.retailPrice || 0,
        retailPrice: design.retailPrice || design.basePrice || 0,
        quantity: line.quantity,
        remarks: line.remarks,
        completed: false,
        completedAt: null
      });
    }

    const order = await prisma.$transaction(async (tx) => {
      const billing = await allocateOrderNumbers(tx, userId, orderMeta.transactionType);
      return tx.order.create({
        data: {
          userId,
          shareLinkId: null,
          designId: primaryDesignId,
          customerId: customerRef.customerId,
          buyerName: customerRef.buyerName,
          buyerPhone: customerRef.buyerPhone,
          quantity: totalQuantity,
          orderLines,
          remarks: remarks?.trim() || null,
          manualType: 'design',
          manualBatchId: batchId,
          status: 'waiting_approval',
          ...orderMeta,
          ...billing
        },
        include: orderInclude
      });
    });

    return res.status(201).json({ order, orders: [order], manualBatchId: batchId });
  } catch (error) {
    next(error);
  }
});

router.post('/erp-sales', authenticateToken, requireActiveSubscription, [
  body('transactionType').optional().trim(),
  body('grandTotal').isFloat({ min: 0.01 }),
  body('taxableAmount').optional().isFloat({ min: 0 }),
  body('totalTaxAmount').optional().isFloat({ min: 0 }),
  body('orderDate').optional(),
  body('orderNumber').optional().trim(),
  body('agentName').optional().trim(),
  body('transportName').optional().trim(),
  body('state').optional().trim(),
  body('remarks').optional().trim(),
  body('buyerName').optional().trim(),
  body('lineItems').optional().isArray()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const customerRef = await resolveManualCustomer(userId, req.body);
    const transactionType = normalizeTransactionType(req.body.transactionType, DEFAULT_SALES_TRANSACTION_TYPE);
    const grandTotal = Number(req.body.grandTotal);
    const taxableAmount = Number(req.body.taxableAmount ?? grandTotal);
    const totalTaxAmount = Number(req.body.totalTaxAmount ?? 0);
    const lineItemsInput = Array.isArray(req.body.lineItems) ? req.body.lineItems : [];
    const completedAt = new Date().toISOString();

    const orderLines = lineItemsInput.length > 0
      ? lineItemsInput.map((line) => {
        const qty = parseInt(line.quantity, 10) || 1;
        const amount = Number(line.amount) || Number(line.rate) * qty || 0;
        return {
          designName: optionalString(line.description) || 'Sales item',
          description: optionalString(line.description) || 'Sales item',
          quantity: qty,
          retailPrice: amount / qty,
          basePrice: amount / qty,
          completed: true,
          completedAt
        };
      })
      : [{
        designName: 'Sales entry',
        description: 'Sales entry',
        quantity: 1,
        retailPrice: taxableAmount,
        basePrice: taxableAmount,
        completed: true,
        completedAt
      }];

    const totalQuantity = orderLines.reduce((sum, line) => sum + (parseInt(line.quantity, 10) || 0), 0);

    const order = await prisma.$transaction(async (tx) => {
      const billing = await allocateOrderNumbers(tx, userId, transactionType);
      return tx.order.create({
        data: {
          userId,
          shareLinkId: null,
          designId: null,
          customerId: customerRef.customerId,
          buyerName: customerRef.buyerName,
          buyerPhone: customerRef.buyerPhone,
          quantity: totalQuantity || 1,
          orderLines,
          remarks: optionalString(req.body.remarks),
          manualType: 'erp_sales',
          orderNumber: optionalString(req.body.orderNumber),
          agentName: optionalString(req.body.agentName),
          transportName: optionalString(req.body.transportName),
          orderDate: optionalDate(req.body.orderDate) || new Date(),
          discountRate: 0,
          shippingCharge: totalTaxAmount,
          status: 'completed',
          ...billing
        },
        include: orderInclude
      });
    });

    res.status(201).json({ order });
  } catch (error) {
    next(error);
  }
});

// Auth: get orders for current user
router.get('/next-invoice-number', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const invoiceNumber = await prisma.$transaction(async (tx) => allocateNextInvoiceNumber(tx, userId));
    res.json({ invoiceNumber: String(invoiceNumber) });
  } catch (error) {
    next(error);
  }
});

// Auth: get orders for current user
router.get('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const orders = await prisma.order.findMany({
      where: { userId },
      include: orderInclude,
      orderBy: { createdAt: 'desc' }
    });

    res.json({ orders });
  } catch (error) {
    next(error);
  }
});

// Auth: create draft order from AI output
router.post('/drafts', authenticateToken, requireActiveSubscription, [
  body('sourceText').notEmpty().trim(),
  body('draft').notEmpty()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const { sourceText, draft } = req.body;

    const saved = await prisma.orderDraft.create({
      data: {
        userId,
        sourceText: sourceText.trim(),
        draftJson: draft,
        status: 'draft'
      }
    });

    res.status(201).json({ draft: saved });
  } catch (error) {
    next(error);
  }
});

// Auth: get draft orders
router.get('/drafts', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const drafts = await prisma.orderDraft.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ drafts });
  } catch (error) {
    next(error);
  }
});

// Auth: update order details (manual / scanned orders)
router.put('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const orderMeta = getOrderMeta(req.body);
    const updateData = { ...orderMeta };

    if (req.body.remarks !== undefined) {
      updateData.remarks = optionalString(req.body.remarks);
    }

    if (req.body.customerId || req.body.customer || req.body.buyerName) {
      const customerRef = await resolveManualCustomer(userId, req.body);
      updateData.customerId = customerRef.customerId;
      updateData.buyerName = customerRef.buyerName;
      updateData.buyerPhone = customerRef.buyerPhone;
    }

    if (Array.isArray(req.body.lines) && req.body.lines.length > 0) {
      const orderLines = [];
      let primaryDesignId = null;
      let totalQuantity = 0;

      for (const line of req.body.lines) {
        const designId = line?.designId;
        const quantity = parseInt(line?.quantity, 10);
        if (!designId || !Number.isFinite(quantity) || quantity < 1) {
          return res.status(400).json({ error: 'Each line needs designId and quantity (min 1)' });
        }

        const design = await prisma.design.findFirst({
          where: { id: designId, userId }
        });
        if (!design) {
          return res.status(400).json({ error: `Design not found or not yours: ${designId}` });
        }

        if (!primaryDesignId) primaryDesignId = designId;
        totalQuantity += quantity;
        orderLines.push({
          designId,
          designName: design.name || 'Untitled Design',
          designCode: design.designCode || null,
          image: design.image,
          fabric: design.fabric,
          basePrice: design.basePrice || design.retailPrice || 0,
          retailPrice: design.retailPrice || design.basePrice || 0,
          quantity,
        remarks: optionalString(line?.remarks),
        completed: Boolean(line?.completed),
        completedAt: line?.completedAt || null
        });
      }

      updateData.orderLines = orderLines;
      updateData.designId = primaryDesignId;
      updateData.quantity = totalQuantity;
      updateData.manualType = 'design';
    }

    const order = await prisma.order.update({
      where: { id },
      data: updateData,
      include: orderInclude
    });

    res.json({ order });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

// Auth: update order status
router.put('/:id/status', authenticateToken, requireActiveSubscription, [
  body('status').notEmpty().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.userId;

    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid order status' });
    }

    const existing = await prisma.order.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (existing.status === status) {
      const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
      return res.json({ order });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updateData = { status };
      const orderLines = normalizeOrderLines(existing.orderLines);

      if (status === 'completed' && orderLines.length > 0) {
        const completedAt = new Date().toISOString();
        const nextLines = [];

        for (const line of orderLines) {
          if (!line.completed) {
            await decrementCompletedLineStock(tx, line);
          }
          nextLines.push({
            ...line,
            completed: true,
            completedAt: line.completedAt || completedAt
          });
        }

        updateData.orderLines = nextLines;
      }

      const order = await tx.order.update({
        where: { id },
        data: updateData
      });

      if (status === 'completed' && orderLines.length === 0 && order.designId) {
        const design = await tx.design.findUnique({
          where: { id: order.designId }
        });

        if (design) {
          const currentStock = design.stockQuantity ?? 0;
          const newStock = currentStock - order.quantity;
          await tx.design.update({
            where: { id: order.designId },
            data: { stockQuantity: newStock }
          });
        }
      }

      return order;
    });

    const orderWithDetails = await prisma.order.findUnique({
      where: { id: updated.id },
      include: orderInclude
    });

    res.json({ order: orderWithDetails });
  } catch (error) {
    next(error);
  }
});

// Auth: update one line item completion in a grouped order
router.put('/:id/lines/:lineIndex/completion', authenticateToken, requireActiveSubscription, [
  body('completed').isBoolean()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id, lineIndex } = req.params;
    const index = parseInt(lineIndex, 10);
    const completed = Boolean(req.body.completed);
    const userId = req.user.userId;

    const existing = await prisma.order.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (existing.status !== 'pending') {
      return res.status(400).json({ error: 'Line items can only be completed while the order is pending' });
    }

    const orderLines = normalizeOrderLines(existing.orderLines);
    if (!Number.isInteger(index) || index < 0 || index >= orderLines.length) {
      return res.status(400).json({ error: 'Invalid line item' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextLines = orderLines.map((line, idx) => {
        if (idx !== index) return line;
        return {
          ...line,
          completed,
          completedAt: completed ? (line.completedAt || new Date().toISOString()) : null
        };
      });

      if (completed && !orderLines[index].completed) {
        await decrementCompletedLineStock(tx, orderLines[index]);
      }

      const allComplete = nextLines.length > 0 && nextLines.every(line => line.completed);
      return tx.order.update({
        where: { id },
        data: {
          orderLines: nextLines,
          status: allComplete ? 'completed' : 'pending'
        }
      });
    });

    const orderWithDetails = await prisma.order.findUnique({
      where: { id: updated.id },
      include: orderInclude
    });

    res.json({ order: orderWithDetails });
  } catch (error) {
    next(error);
  }
});

// Auth: confirm draft and create orders
router.post('/drafts/:id/confirm', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const draft = await prisma.orderDraft.findUnique({
      where: { id }
    });

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    if (draft.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const draftJson = draft.draftJson || {};
    const detected = draftJson.detected_designs || [];

    const createdOrders = [];
    for (const item of detected) {
      if (!item.matched_design_id) continue;
      const qty = item.quantity ? parseInt(item.quantity, 10) : 1;
      const order = await prisma.order.create({
        data: {
          userId,
          shareLinkId: null,
          designId: item.matched_design_id,
          buyerName: 'AI Draft',
          buyerPhone: 'N/A',
          quantity: qty,
          status: 'waiting_approval'
        }
      });
      createdOrders.push(order);
    }

    await prisma.orderDraft.update({
      where: { id },
      data: { status: 'confirmed' }
    });

    res.json({ orders: createdOrders });
  } catch (error) {
    next(error);
  }
});

export default router;
