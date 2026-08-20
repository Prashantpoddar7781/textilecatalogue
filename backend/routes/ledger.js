import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import {
  buildCustomerLedger,
  buildSupplierLedger,
  buildUnifiedPartyLedger,
  getAllLedgerParties,
  getCustomerLedgerParties,
  getLedgerEntryDetail,
  getSupplierLedgerParties
} from '../utils/accountLedger.js';
import { buildFinalAccounts } from '../utils/finalAccounts.js';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/parties', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const rawType = String(req.query.partyType || 'all').toLowerCase();

    if (rawType === 'supplier') {
      const parties = await getSupplierLedgerParties(prisma, userId);
      return res.json({ partyType: 'supplier', parties });
    }
    if (rawType === 'customer') {
      const parties = await getCustomerLedgerParties(prisma, userId);
      return res.json({ partyType: 'customer', parties });
    }

    const parties = await getAllLedgerParties(prisma, userId);
    res.json({ partyType: 'all', parties });
  } catch (error) {
    next(error);
  }
});

router.get('/final-accounts', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const view = String(req.query.view || 'all').toLowerCase();
    const result = await buildFinalAccounts(prisma, req.user.userId, {
      view: ['trial', 'trading', 'pl', 'balance', 'all'].includes(view) ? view : 'all',
      fromDate: req.query.fromDate ? String(req.query.fromDate) : null,
      toDate: req.query.toDate ? String(req.query.toDate) : null,
      asOnDate: req.query.asOnDate ? String(req.query.asOnDate) : null
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/account', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const partyName = String(req.query.partyName || '').trim();
    if (!partyName) {
      return res.status(400).json({ error: 'partyName is required' });
    }
    const supplierId = req.query.supplierId ? String(req.query.supplierId) : null;
    const customerId = req.query.customerId ? String(req.query.customerId) : null;
    const fromDate = req.query.fromDate ? String(req.query.fromDate).trim() : null;
    const toDate = req.query.toDate ? String(req.query.toDate).trim() : null;
    const result = await buildUnifiedPartyLedger(prisma, req.user.userId, {
      partyName,
      supplierId,
      customerId,
      fromDate,
      toDate
    });
    if (!result) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json(result);
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
