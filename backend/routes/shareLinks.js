import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { requireActiveSubscription, requireActiveSubscriptionIfAuthenticated } from '../middleware/subscription.js';
import crypto from 'crypto';

const router = express.Router();
const prisma = new PrismaClient();
const SHARE_LINK_SECURITY_MODES = ['normal', 'device_locked'];

// Generate unique token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getViewerDeviceToken(req) {
  const token = req.query.deviceToken || req.headers['x-threadx-device-token'];
  if (!token) return null;
  const text = String(token).trim();
  return text.length >= 12 && text.length <= 160 ? text : null;
}

async function enforceShareLinkDeviceLock(shareLink, deviceToken) {
  if (shareLink.securityMode !== 'device_locked') return shareLink;

  if (!deviceToken) {
    const error = new Error('This secured link needs to be opened in a browser that supports device locking.');
    error.status = 403;
    throw error;
  }

  if (!shareLink.lockedDeviceToken) {
    const updated = await prisma.shareLink.updateMany({
      where: {
        id: shareLink.id,
        lockedDeviceToken: null
      },
      data: {
        lockedDeviceToken: deviceToken,
        lockedAt: new Date()
      }
    });

    if (updated.count > 0) {
      return {
        ...shareLink,
        lockedDeviceToken: deviceToken,
        lockedAt: new Date()
      };
    }

    const latest = await prisma.shareLink.findUnique({
      where: { id: shareLink.id }
    });
    if (latest?.lockedDeviceToken === deviceToken) return shareLink;
  }

  if (shareLink.lockedDeviceToken !== deviceToken) {
    const error = new Error('This secured catalogue link is locked to another device. Please ask the seller for a new link.');
    error.status = 423;
    throw error;
  }

  return shareLink;
}

// Create shareable link (requires auth)
router.post('/', authenticateToken, requireActiveSubscription, [
  body('designId').optional().notEmpty(),
  body('designIds').optional().isArray({ min: 1 }),
  body('expiresAt').optional().isISO8601(),
  body('selectedPriceType').optional().trim(),
  body('securityMode').optional().isIn(SHARE_LINK_SECURITY_MODES)
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { designId, designIds, expiresAt, selectedPriceType } = req.body;
    const securityMode = SHARE_LINK_SECURITY_MODES.includes(req.body.securityMode)
      ? req.body.securityMode
      : 'normal';
    const userId = req.user.userId;

    const idsToShare = designIds && designIds.length > 0 ? designIds : (designId ? [designId] : []);
    if (idsToShare.length === 0) {
      return res.status(400).json({ error: 'designId or designIds is required' });
    }

    // Verify all designs belong to user and are in stock (exclude stockQuantity === 0)
    const designs = await prisma.design.findMany({
      where: {
        id: { in: idsToShare },
        userId,
        OR: [
          { stockQuantity: { gt: 0 } },
          { stockQuantity: null }
        ]
      }
    });

    if (designs.length !== idsToShare.length) {
      return res.status(400).json({ error: 'One or more designs are out of stock and cannot be shared' });
    }

    // Create share link
    const shareLink = await prisma.shareLink.create({
      data: {
        userId,
        designId: idsToShare.length === 1 ? idsToShare[0] : null,
        token: generateToken(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true,
        selectedPriceType: selectedPriceType || null,
        securityMode,
        designs: {
          createMany: {
            data: idsToShare.map(id => ({ designId: id }))
          }
        }
      },
      include: {
        design: true,
        designs: {
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
        }
      }
    });

    res.status(201).json(shareLink);
  } catch (error) {
    next(error);
  }
});

// Create shareable link for entire collection (requires auth)
router.post('/collection', authenticateToken, requireActiveSubscription, [
  body('expiresAt').optional().isISO8601(),
  body('selectedPriceType').optional().trim(),
  body('securityMode').optional().isIn(SHARE_LINK_SECURITY_MODES)
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { expiresAt, selectedPriceType } = req.body;
    const securityMode = SHARE_LINK_SECURITY_MODES.includes(req.body.securityMode)
      ? req.body.securityMode
      : 'normal';
    const userId = req.user.userId;

    const designs = await prisma.design.findMany({
      where: {
        userId,
        OR: [
          { stockQuantity: { gt: 0 } },
          { stockQuantity: null }
        ]
      },
      select: { id: true }
    });

    if (designs.length === 0) {
      return res.status(400).json({ error: 'No in-stock designs found to share' });
    }

    const idsToShare = designs.map(d => d.id);

    const shareLink = await prisma.shareLink.create({
      data: {
        userId,
        designId: null,
        token: generateToken(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true,
        selectedPriceType: selectedPriceType || null,
        securityMode,
        designs: {
          createMany: {
            data: idsToShare.map(id => ({ designId: id }))
          }
        }
      },
      include: {
        designs: {
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
        }
      }
    });

    res.status(201).json(shareLink);
  } catch (error) {
    next(error);
  }
});

// Get share link analytics for user (requires auth) - must be before GET /:token
router.get('/stats', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const shareLinks = await prisma.shareLink.findMany({
      where: { userId },
      select: { id: true, token: true }
    });
    const shareLinkIds = shareLinks.map(s => s.id);

    const [totalOpens, opensByLink, designViewCounts] = await Promise.all([
      prisma.shareLinkOpen.count({ where: { shareLinkId: { in: shareLinkIds } } }),
      prisma.shareLinkOpen.groupBy({
        by: ['shareLinkId'],
        where: { shareLinkId: { in: shareLinkIds } },
        _count: { id: true }
      }),
      prisma.shareLinkDesignView.groupBy({
        by: ['designId'],
        where: { shareLinkId: { in: shareLinkIds } },
        _count: { id: true }
      })
    ]);

    const designIds = [...new Set(designViewCounts.map(d => d.designId))];
    const designs = designIds.length
      ? await prisma.design.findMany({
          where: { id: { in: designIds } },
          select: { id: true, name: true, image: true, fabric: true }
        })
      : [];
    const designMap = Object.fromEntries(designs.map(d => [d.id, d]));

    const mostViewedDesigns = designViewCounts
      .map(({ designId, _count }) => ({
        designId,
        viewCount: _count.id,
        design: designMap[designId] || null
      }))
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 20);

    const openCountByLinkId = Object.fromEntries(
      opensByLink.map(o => [o.shareLinkId, o._count.id])
    );
    const linksWithOpens = shareLinks.map(link => ({
      id: link.id,
      token: link.token,
      openCount: openCountByLinkId[link.id] || 0
    }));

    res.json({
      totalOpens,
      mostViewedDesigns,
      linksWithOpens: linksWithOpens
    });
  } catch (error) {
    next(error);
  }
});

// Get all share links for user (requires auth)
router.get('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
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
        },
        designs: {
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
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ shareLinks });
  } catch (error) {
    next(error);
  }
});

// Record share link open (public, no auth) - call when someone opens the shared page
router.post('/:token/open', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { sessionId } = req.body || {};
    const shareLink = await prisma.shareLink.findUnique({
      where: { token }
    });
    if (!shareLink || !shareLink.isActive) {
      return res.status(404).json({ error: 'Share link not found' });
    }
    if (shareLink.expiresAt && new Date() > new Date(shareLink.expiresAt)) {
      return res.status(403).json({ error: 'Share link expired' });
    }
    await prisma.shareLinkOpen.create({
      data: {
        shareLinkId: shareLink.id,
        sessionId: sessionId || null
      }
    });
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Record design view on share page (public, no auth)
router.post('/:token/view', [
  body('designId').notEmpty()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { token } = req.params;
    const { designId, sessionId } = req.body || {};
    const shareLink = await prisma.shareLink.findUnique({
      where: { token },
      include: {
        designs: { select: { designId: true } },
        design: { select: { id: true } }
      }
    });
    if (!shareLink || !shareLink.isActive) {
      return res.status(404).json({ error: 'Share link not found' });
    }
    if (shareLink.expiresAt && new Date() > new Date(shareLink.expiresAt)) {
      return res.status(403).json({ error: 'Share link expired' });
    }
    const allowedIds = new Set([
      ...shareLink.designs.map(d => d.designId),
      ...(shareLink.design ? [shareLink.design.id] : [])
    ]);
    if (!allowedIds.has(designId)) {
      return res.status(400).json({ error: 'Design not in this share link' });
    }
    await prisma.shareLinkDesignView.create({
      data: {
        shareLinkId: shareLink.id,
        designId,
        sessionId: sessionId || null
      }
    });
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Get share link by token (public, no auth required)
router.get('/:token', optionalAuth, requireActiveSubscriptionIfAuthenticated, async (req, res, next) => {
  try {
    const { token } = req.params;
    let shareLink = await prisma.shareLink.findUnique({
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
        },
        designs: {
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

    try {
      shareLink = await enforceShareLinkDeviceLock(shareLink, getViewerDeviceToken(req));
    } catch (error) {
      return res.status(error.status || 403).json({ error: error.message });
    }

    // Filter out out-of-stock designs from response
    const inStockDesigns = shareLink.designs?.filter(
      (sd) => sd.design && (sd.design.stockQuantity ?? 0) > 0
    ) || [];
    const payload = {
      ...shareLink,
      designs: inStockDesigns,
      design: shareLink.design && (shareLink.design.stockQuantity ?? 0) > 0 ? shareLink.design : null
    };
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

// Disable share link (requires auth, owner only)
router.put('/:id/disable', authenticateToken, requireActiveSubscription, async (req, res, next) => {
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
router.put('/:id/enable', authenticateToken, requireActiveSubscription, async (req, res, next) => {
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
router.delete('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
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
