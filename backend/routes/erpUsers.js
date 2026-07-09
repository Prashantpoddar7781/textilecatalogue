import express from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';

const router = express.Router();
const prisma = new PrismaClient();

const ACCESS_LEVELS = new Set(['data_entry', 'complete_access']);

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

router.get('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const users = await prisma.erpUser.findMany({
      where: { ownerUserId: req.user.userId },
      orderBy: { createdAt: 'asc' }
    });
    res.json({ users: users.map(sanitizeUser) });
  } catch (error) {
    next(error);
  }
});

router.get('/count', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const count = await prisma.erpUser.count({
      where: { ownerUserId: req.user.userId, isActive: true }
    });
    res.json({ count });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, requireActiveSubscription, [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('password').isLength({ min: 4 }).withMessage('Password must be at least 4 characters'),
  body('accessLevel').isIn(['data_entry', 'complete_access']).withMessage('Invalid access level')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const name = String(req.body.name).trim();
    const accessLevel = ACCESS_LEVELS.has(req.body.accessLevel) ? req.body.accessLevel : 'data_entry';
    const hashedPassword = await bcrypt.hash(String(req.body.password), 10);

    const user = await prisma.erpUser.create({
      data: {
        ownerUserId: req.user.userId,
        name,
        password: hashedPassword,
        accessLevel
      }
    });

    res.status(201).json({ user: sanitizeUser(user) });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A user with this name already exists' });
    }
    next(error);
  }
});

router.put('/:id', authenticateToken, requireActiveSubscription, [
  body('name').optional().trim().notEmpty(),
  body('password').optional().isLength({ min: 4 }),
  body('accessLevel').optional().isIn(['data_entry', 'complete_access']),
  body('isActive').optional().isBoolean()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = await prisma.erpUser.findFirst({
      where: { id: req.params.id, ownerUserId: req.user.userId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'ERP user not found' });
    }

    const data = {};
    if (req.body.name != null) data.name = String(req.body.name).trim();
    if (req.body.accessLevel != null && ACCESS_LEVELS.has(req.body.accessLevel)) {
      data.accessLevel = req.body.accessLevel;
    }
    if (typeof req.body.isActive === 'boolean') data.isActive = req.body.isActive;
    if (req.body.password) data.password = await bcrypt.hash(String(req.body.password), 10);

    const user = await prisma.erpUser.update({
      where: { id: existing.id },
      data
    });

    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A user with this name already exists' });
    }
    next(error);
  }
});

router.delete('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const existing = await prisma.erpUser.findFirst({
      where: { id: req.params.id, ownerUserId: req.user.userId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'ERP user not found' });
    }

    await prisma.erpUser.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
