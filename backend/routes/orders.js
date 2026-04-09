import express from 'express';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';

const router = express.Router();
const prisma = new PrismaClient();

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
        status: 'pending'
      },
      include: {
        design: {
          select: {
            id: true,
            name: true,
            image: true,
            fabric: true
          }
        }
      }
    });

    res.status(201).json({ order });
  } catch (error) {
    next(error);
  }
});

// Auth: create manual order (open parcel or design lines)
router.post('/manual', authenticateToken, requireActiveSubscription, [
  body('kind').isIn(['open', 'design']),
  body('buyerName').trim().notEmpty(),
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
    const { kind, buyerName, remarks } = req.body;

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
          buyerName: buyerName.trim(),
          buyerPhone: '-',
          quantity: qty,
          remarks: remarks?.trim() || null,
          manualType: 'open',
          status: 'pending'
        },
        include: {
          design: {
            select: {
              id: true,
              name: true,
              image: true,
              fabric: true
            }
          }
        }
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
          buyerName: buyerName.trim(),
          buyerPhone: '-',
          quantity,
          remarks: remarks?.trim() || null,
          manualType: 'design',
          manualBatchId: batchId,
          status: 'pending'
        },
        include: {
          design: {
            select: {
              id: true,
              name: true,
              image: true,
              fabric: true
            }
          }
        }
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
      include: {
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
      },
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
      return res.json({ order: existing });
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

    res.json({ order: updated });
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
          status: 'pending'
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
