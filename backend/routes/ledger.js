import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import {
  buildCustomerLedger,
  buildSupplierLedger,
  getCustomerLedgerParties,
  getLedgerEntryDetail,
  getSupplierLedgerParties
} from '../utils/accountLedger.js';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/parties', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const partyType = req.query.partyType === 'supplier' ? 'supplier' : 'customer';

    if (partyType === 'supplier') {
      const parties = await getSupplierLedgerParties(prisma, userId);
      return res.json({ partyType, parties });
    }

    const parties = await getCustomerLedgerParties(prisma, userId);
    res.json({ partyType, parties });
  } catch (error) {
    next(error);
  }
});

router.get('/customer', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const partyName = String(req.query.partyName || '').trim();
    if (!partyName) {
      return res.status(400).json({ error: 'partyName is required' });
    }

    const result = await buildCustomerLedger(prisma, req.user.userId, partyName);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/entry/:sourceType/:sourceId', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const detail = await getLedgerEntryDetail(
      prisma,
      req.user.userId,
      req.params.sourceType,
      req.params.sourceId
    );
    if (!detail) {
      return res.status(404).json({ error: 'Ledger entry not found' });
    }
    res.json({ detail });
  } catch (error) {
    next(error);
  }
});

router.get('/supplier/:supplierId', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const result = await buildSupplierLedger(prisma, req.user.userId, req.params.supplierId);
    if (!result) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
