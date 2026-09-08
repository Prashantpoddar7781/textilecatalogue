import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import {
  buildCustomerLedger,
  buildSupplierLedger,
  buildUnifiedPartyLedger,
  buildCompanySelfLedger,
  getAllLedgerParties,
  getCustomerLedgerParties,
  getLedgerEntryDetail,
  getSupplierLedgerParties
} from '../utils/accountLedger.js';
import { buildFinalAccounts, buildFinalAccountsDrill } from '../utils/finalAccounts.js';
import { loadInterestDefaults, buildPartyInterestReport } from '../utils/interestReport.js';

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
      presentation: String(req.query.presentation || 'normal').toLowerCase() === 'dynamic' ? 'dynamic' : 'normal',
      fromDate: req.query.fromDate ? String(req.query.fromDate) : null,
      toDate: req.query.toDate ? String(req.query.toDate) : null,
      asOnDate: req.query.asOnDate ? String(req.query.asOnDate) : null
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/final-accounts/drill', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const result = await buildFinalAccountsDrill(prisma, req.user.userId, {
      drillKey: req.query.drillKey ? String(req.query.drillKey) : null,
      level: req.query.level ? String(req.query.level) : 'parties',
      partyName: req.query.partyName ? String(req.query.partyName) : null,
      account: req.query.account ? String(req.query.account) : null,
      accountType: req.query.accountType ? String(req.query.accountType) : null,
      fromDate: req.query.fromDate ? String(req.query.fromDate) : null,
      toDate: req.query.toDate ? String(req.query.toDate) : null,
      asOnDate: req.query.asOnDate ? String(req.query.asOnDate) : null
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/interest-defaults', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const result = await loadInterestDefaults(prisma, req.user.userId, {
      partyName: String(req.query.partyName || '').trim(),
      partyType: String(req.query.partyType || '').trim(),
      customerId: req.query.customerId ? String(req.query.customerId) : null,
      supplierId: req.query.supplierId ? String(req.query.supplierId) : null
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/interest-report', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const result = await buildPartyInterestReport(prisma, req.user.userId, req.body || {});
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

router.get('/account', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const partyName = String(req.query.partyName || '').trim();
    const partyType = String(req.query.partyType || '').trim().toLowerCase();
    const fromDate = req.query.fromDate ? String(req.query.fromDate).trim() : null;
    const toDate = req.query.toDate ? String(req.query.toDate).trim() : null;
    if (partyType === 'company') {
      const result = await buildCompanySelfLedger(prisma, req.user.userId, { fromDate, toDate });
      return res.json(result);
    }
    if (!partyName) {
      return res.status(400).json({ error: 'partyName is required' });
    }
    const supplierId = req.query.supplierId ? String(req.query.supplierId) : null;
    const customerId = req.query.customerId ? String(req.query.customerId) : null;
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
