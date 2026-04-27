import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';

const router = express.Router();
const prisma = new PrismaClient();

const optionalString = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

const optionalNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const customerSelect = {
  id: true,
  organizationName: true,
  gstNumber: true,
  contactPersonName: true,
  mobileNumber: true,
  agentName: true,
  category: true,
  state: true,
  city: true,
  pincode: true,
  discountRate: true,
  createdAt: true,
  updatedAt: true
};

router.get('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const customers = await prisma.customer.findMany({
      where: { userId },
      select: customerSelect,
      orderBy: { organizationName: 'asc' }
    });
    res.json({ customers });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, requireActiveSubscription, [
  body('organizationName').trim().notEmpty().withMessage('Customer organization name is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const customer = await prisma.customer.create({
      data: {
        userId,
        organizationName: req.body.organizationName.trim(),
        gstNumber: optionalString(req.body.gstNumber),
        contactPersonName: optionalString(req.body.contactPersonName),
        mobileNumber: optionalString(req.body.mobileNumber),
        agentName: optionalString(req.body.agentName),
        category: optionalString(req.body.category),
        state: optionalString(req.body.state),
        city: optionalString(req.body.city),
        pincode: optionalString(req.body.pincode),
        discountRate: optionalNumber(req.body.discountRate)
      },
      select: customerSelect
    });

    res.status(201).json({ customer });
  } catch (error) {
    next(error);
  }
});

export default router;
