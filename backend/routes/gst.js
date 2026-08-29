import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { buildGstr3b, ITC_BUCKETS } from '../utils/gstr3b.js';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/gstr-3b', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const bucket = String(req.query.bucket || 'ALL').trim();
    const allowed = ['ALL', 'Outward', ...ITC_BUCKETS];
    const result = await buildGstr3b(prisma, req.user.userId, {
      bucket: allowed.includes(bucket) ? bucket : 'ALL',
      fromDate: req.query.fromDate ? String(req.query.fromDate) : null,
      toDate: req.query.toDate ? String(req.query.toDate) : null
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
