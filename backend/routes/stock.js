import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { buildStockLedger, STOCK_LEDGER_TYPES } from '../utils/stockLedger.js';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/report', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const stockType = String(req.query.stockType || 'ALL').trim().toUpperCase();
    const result = await buildStockLedger(prisma, req.user.userId, {
      stockType: STOCK_LEDGER_TYPES.includes(stockType) ? stockType : 'ALL',
      fromDate: req.query.fromDate ? String(req.query.fromDate) : null,
      toDate: req.query.toDate ? String(req.query.toDate) : null
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
