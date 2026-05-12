import express from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { PRICING_PLANS, ensureSubscriptionDefaults, getSubscriptionSnapshot } from '../middleware/subscription.js';

const router = express.Router();
const prisma = new PrismaClient();

const getRazorpayClient = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return null;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
};

const getPlanId = (plan) => {
  if (plan === 'monthly') return process.env.RAZORPAY_PLAN_MONTHLY;
  if (plan === 'annual') return process.env.RAZORPAY_PLAN_ANNUAL;
  return null;
};

const getTotalCount = (plan) => {
  const defaultCount = plan === 'monthly' ? 120 : 10;
  const envKey = plan === 'monthly' ? 'RAZORPAY_MONTHLY_TOTAL_COUNT' : 'RAZORPAY_ANNUAL_TOTAL_COUNT';
  const configuredCount = Number.parseInt(process.env[envKey] || '', 10);
  return Number.isFinite(configuredCount) && configuredCount > 0 ? configuredCount : defaultCount;
};

router.get('/plans', (req, res) => {
  res.json({ plans: PRICING_PLANS });
});

router.get('/status', authenticateToken, async (req, res, next) => {
  try {
    const user = await ensureSubscriptionDefaults(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const snapshot = getSubscriptionSnapshot(user);
    res.json({ subscription: snapshot });
  } catch (error) {
    next(error);
  }
});

router.post('/razorpay/subscription', authenticateToken, async (req, res, next) => {
  try {
    const { plan } = req.body;
    if (!['monthly', 'annual'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const planId = getPlanId(plan);
    if (!planId) {
      return res.status(500).json({ error: 'Razorpay plan ID not configured' });
    }

    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return res.status(500).json({ error: 'Razorpay credentials not configured' });
    }

    let user = await ensureSubscriptionDefaults(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let customerId = user.razorpayCustomerId;
    if (!customerId) {
      const customer = await razorpay.customers.create({
        name: user.name || user.email,
        email: user.email
      });
      customerId = customer.id;
      user = await prisma.user.update({
        where: { id: user.id },
        data: { razorpayCustomerId: customerId }
      });
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      customer_id: customerId,
      total_count: getTotalCount(plan),
      customer_notify: 1
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: subscription.status,
        subscriptionPlan: plan,
        subscriptionStartedAt: subscription.start_at ? new Date(subscription.start_at * 1000) : null,
        subscriptionEndsAt: subscription.current_end ? new Date(subscription.current_end * 1000) : null,
        razorpaySubscriptionId: subscription.id
      }
    });

    res.json({
      subscriptionId: subscription.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      plan,
      customerId,
      email: user.email
    });
  } catch (error) {
    next(error);
  }
});

router.post('/razorpay/subscription/cancel', authenticateToken, async (req, res, next) => {
  try {
    const user = await ensureSubscriptionDefaults(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.razorpaySubscriptionId) {
      return res.status(400).json({ error: 'No Razorpay subscription found for this account' });
    }

    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return res.status(500).json({ error: 'Razorpay credentials not configured' });
    }

    const cancelledSubscription = await razorpay.subscriptions.cancel(
      user.razorpaySubscriptionId,
      true
    );

    const subscriptionEndsAt = cancelledSubscription.current_end
      ? new Date(cancelledSubscription.current_end * 1000)
      : user.subscriptionEndsAt;

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: 'cancelled',
        subscriptionEndsAt
      }
    });

    res.json({ subscription: getSubscriptionSnapshot(updatedUser) });
  } catch (error) {
    next(error);
  }
});

router.post('/razorpay/webhook', async (req, res, next) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody;

    if (secret && signature && rawBody && Buffer.isBuffer(rawBody)) {
      const expected = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');
      if (expected !== signature) {
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    const payload = rawBody && Buffer.isBuffer(rawBody)
      ? JSON.parse(rawBody.toString('utf8'))
      : req.body;
    const subscription = payload?.payload?.subscription?.entity;
    if (!subscription?.id) {
      return res.json({ received: true });
    }

    const subscriptionStatus = subscription.status || null;
    const subscriptionEndsAt = subscription.current_end
      ? new Date(subscription.current_end * 1000)
      : null;

    const planMonthly = process.env.RAZORPAY_PLAN_MONTHLY;
    const planAnnual = process.env.RAZORPAY_PLAN_ANNUAL;
    let subscriptionPlan = null;
    if (subscription.plan_id && planMonthly && subscription.plan_id === planMonthly) {
      subscriptionPlan = 'monthly';
    } else if (subscription.plan_id && planAnnual && subscription.plan_id === planAnnual) {
      subscriptionPlan = 'annual';
    }

    await prisma.user.updateMany({
      where: { razorpaySubscriptionId: subscription.id },
      data: {
        subscriptionStatus,
        subscriptionPlan,
        subscriptionEndsAt,
        subscriptionStartedAt: subscription.start_at ? new Date(subscription.start_at * 1000) : undefined
      }
    });

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});

export default router;
