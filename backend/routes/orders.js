import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';

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

// Auth: get orders for current user
router.get('/', authenticateToken, async (req, res, next) => {
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

export default router;
