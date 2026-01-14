import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import crypto from 'crypto';

const router = express.Router();
const prisma = new PrismaClient();

// Generate unique token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Create shareable link (requires auth)
router.post('/', authenticateToken, [
  body('designId').notEmpty(),
  body('expiresAt').optional().isISO8601(),
  body('selectedPriceType').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { designId, expiresAt, selectedPriceType } = req.body;
    const userId = req.user.userId;

    // Verify design belongs to user
    const design = await prisma.design.findFirst({
      where: { id: designId, userId }
    });

    if (!design) {
      return res.status(404).json({ error: 'Design not found' });
    }

    // Create share link
    const shareLink = await prisma.shareLink.create({
      data: {
        userId,
        designId,
        token: generateToken(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true,
        selectedPriceType: selectedPriceType || null
      },
      include: {
        design: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                firmName: true
              }
            }
          }
        }
      }
    });

    res.status(201).json(shareLink);
  } catch (error) {
    next(error);
  }
});

// Get all share links for user (requires auth)
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const shareLinks = await prisma.shareLink.findMany({
      where: { userId },
      include: {
        design: {
          select: {
            id: true,
            name: true,
            image: true,
            fabric: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ shareLinks });
  } catch (error) {
    next(error);
  }
});

// Get share link by token (public, no auth required)
router.get('/:token', optionalAuth, async (req, res, next) => {
  try {
    const { token } = req.params;
    const shareLink = await prisma.shareLink.findUnique({
      where: { token },
      include: {
        design: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                firmName: true
              }
            },
            catalogue: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!shareLink) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    // Check if link is active
    if (!shareLink.isActive) {
      return res.status(403).json({ error: 'This share link has been disabled' });
    }

    // Check if link has expired
    if (shareLink.expiresAt && new Date() > new Date(shareLink.expiresAt)) {
      return res.status(403).json({ error: 'This share link has expired' });
    }

    res.json(shareLink);
  } catch (error) {
    next(error);
  }
});

// Disable share link (requires auth, owner only)
router.put('/:id/disable', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check ownership
    const shareLink = await prisma.shareLink.findFirst({
      where: { id, userId }
    });

    if (!shareLink) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    // Disable the link
    const updated = await prisma.shareLink.update({
      where: { id },
      data: { isActive: false }
    });

    res.json({ message: 'Share link disabled successfully', shareLink: updated });
  } catch (error) {
    next(error);
  }
});

// Enable share link (requires auth, owner only)
router.put('/:id/enable', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check ownership
    const shareLink = await prisma.shareLink.findFirst({
      where: { id, userId }
    });

    if (!shareLink) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    // Enable the link
    const updated = await prisma.shareLink.update({
      where: { id },
      data: { isActive: true }
    });

    res.json({ message: 'Share link enabled successfully', shareLink: updated });
  } catch (error) {
    next(error);
  }
});

// Delete share link (requires auth, owner only)
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check ownership
    const shareLink = await prisma.shareLink.findFirst({
      where: { id, userId }
    });

    if (!shareLink) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    await prisma.shareLink.delete({
      where: { id }
    });

    res.json({ message: 'Share link deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
