import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';

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

const getOrderMeta = (body) => ({
  priceCategory: optionalString(body.priceCategory),
  orderNumber: optionalString(body.orderNumber),
  agentName: optionalString(body.agentName),
  transportName: optionalString(body.transportName),
  discountRate: optionalNumber(body.discountRate),
  shippingCharge: optionalNumber(body.shippingCharge),
  orderDate: optionalDate(body.orderDate),
  expectedDate: optionalDate(body.expectedDate)
});

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
      const error = new Error('Customer organization name is required');
      error.status = 400;
      throw error;
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
  if (!buyerName) {
    const error = new Error('Customer name is required');
    error.status = 400;
    throw error;
  }
  return {
    customerId: null,
    buyerName,
    buyerPhone: optionalString(body.buyerPhone) || '-',
    customer: null
  };
}

// Public: create order from share link token
router.post('/public', [
  body('token').notEmpty(),
  body('designId').notEmpty(),
  body('buyerName').notEmpty().trim(),
  body('buyerPhone').notEmpty().trim(),
  body('quantity').isInt({ min: 1 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, designId, buyerName, buyerPhone, quantity } = req.body;

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

    const order = await prisma.order.create({
      data: {
        userId: shareLink.userId,
        shareLinkId: shareLink.id,
        designId,
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim(),
        quantity: parseInt(quantity, 10),
        status: 'waiting_approval'
      },
      include: orderInclude
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

      const order = await prisma.order.create({
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
          ...orderMeta
        },
        include: orderInclude
      });

      return res.status(201).json({ order });
    }

    const lines = req.body.lines;
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'Design order requires at least one line with designId and quantity' });
    }

    const batchId = randomUUID();
    const created = [];

    for (const line of lines) {
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

      const order = await prisma.order.create({
        data: {
          userId,
          shareLinkId: null,
          designId,
          customerId: customerRef.customerId,
          buyerName: customerRef.buyerName,
          buyerPhone: customerRef.buyerPhone,
          quantity,
          remarks: remarks?.trim() || null,
          manualType: 'design',
          manualBatchId: batchId,
          status: 'waiting_approval',
          ...orderMeta
        },
        include: orderInclude
      });
      created.push(order);
    }

    return res.status(201).json({ orders: created, manualBatchId: batchId });
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
      const order = await tx.order.update({
        where: { id },
        data: { status }
      });

      if (status === 'completed' && order.designId) {
        const design = await tx.design.findUnique({
          where: { id: order.designId }
        });

        if (design) {
          const currentStock = design.stockQuantity ?? 0;
          const newStock = Math.max(currentStock - order.quantity, 0);
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
