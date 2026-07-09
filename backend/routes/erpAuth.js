import express from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { getCurrentAccountingYear, listAccountingYearOptions, parseAccountingYear } from '../utils/accountingYear.js';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/status', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const count = await prisma.erpUser.count({
      where: { ownerUserId: req.user.userId, isActive: true }
    });
    const currentAccountingYear = getCurrentAccountingYear();
    res.json({
      requiresLogin: count > 0,
      userCount: count,
      currentAccountingYear,
      accountingYears: listAccountingYearOptions()
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', authenticateToken, requireActiveSubscription, [
  body('name').trim().notEmpty().withMessage('User ID is required'),
  body('password').notEmpty().withMessage('Password is required'),
  body('accountingYear').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const name = String(req.body.name).trim();
    const accountingYearLabel = String(req.body.accountingYear || getCurrentAccountingYear()).trim();
    const parsedYear = parseAccountingYear(accountingYearLabel) || parseAccountingYear(getCurrentAccountingYear());

    const erpUser = await prisma.erpUser.findFirst({
      where: {
        ownerUserId: req.user.userId,
        name: { equals: name, mode: 'insensitive' },
        isActive: true
      }
    });

    if (!erpUser) {
      return res.status(401).json({ error: 'Invalid user ID or password' });
    }

    const validPassword = await bcrypt.compare(String(req.body.password), erpUser.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid user ID or password' });
    }

    res.json({
      session: {
        erpUserId: erpUser.id,
        name: erpUser.name,
        accessLevel: erpUser.accessLevel,
        accountingYear: parsedYear.label,
        ownerUserId: req.user.userId
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
