import express from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { google } from 'googleapis';
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

const GOOGLE_PLAY_PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.textilehub.catalogue';
const GOOGLE_PLAY_PRODUCT_IDS = {
  monthly: process.env.GOOGLE_PLAY_MONTHLY_PRODUCT_ID || 'sutra_monthly_599',
  annual: process.env.GOOGLE_PLAY_ANNUAL_PRODUCT_ID || 'sutra_annual_6499'
};

const getGooglePlayPlan = (productId) => {
  if (productId === GOOGLE_PLAY_PRODUCT_IDS.monthly) return 'monthly';
  if (productId === GOOGLE_PLAY_PRODUCT_IDS.annual) return 'annual';
  return null;
};

const parseGooglePlayServiceAccount = () => {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
};

const getAndroidPublisher = () => {
  const credentials = parseGooglePlayServiceAccount();
  if (!credentials) return null;

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/androidpublisher']
  });

  return google.androidpublisher({ version: 'v3', auth });
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
        subscriptionSource: 'razorpay',
        subscriptionStartedAt: subscription.start_at ? new Date(subscription.start_at * 1000) : null,
        subscriptionEndsAt: subscription.current_end ? new Date(subscription.current_end * 1000) : null,
        razorpaySubscriptionId: subscription.id,
        googlePlayProductId: null,
        googlePlayPurchaseToken: null
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

router.post('/google-play/subscription/verify', authenticateToken, async (req, res, next) => {
  try {
    const { productId, purchaseToken } = req.body;
    const plan = getGooglePlayPlan(productId);

    if (!plan || !purchaseToken) {
      return res.status(400).json({ error: 'Invalid Google Play subscription purchase' });
    }

    const androidPublisher = getAndroidPublisher();
    if (!androidPublisher) {
      return res.status(500).json({ error: 'Google Play service account is not configured' });
    }

    const user = await ensureSubscriptionDefaults(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { data: googleSubscription } = await androidPublisher.purchases.subscriptionsv2.get({
      packageName: GOOGLE_PLAY_PACKAGE_NAME,
      token: purchaseToken
    });

    const lineItem = (googleSubscription.lineItems || []).find(item => item.productId === productId)
      || googleSubscription.lineItems?.[0];

    if (!lineItem || lineItem.productId !== productId) {
      return res.status(400).json({ error: 'Google Play purchase does not match the selected plan' });
    }

    const subscriptionEndsAt = lineItem.expiryTime ? new Date(lineItem.expiryTime) : null;
    const expiredOrRevoked = ['SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_REVOKED'].includes(
      googleSubscription.subscriptionState
    );
    const hasPaidAccess = Boolean(subscriptionEndsAt && subscriptionEndsAt > new Date() && !expiredOrRevoked);
    const willRenew = Boolean(lineItem.autoRenewingPlan?.autoRenewEnabled);
    const subscriptionStatus = hasPaidAccess
      ? (willRenew ? 'active' : 'cancelled')
      : 'expired';

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus,
        subscriptionPlan: plan,
        subscriptionSource: 'google_play',
        subscriptionStartedAt: googleSubscription.startTime ? new Date(googleSubscription.startTime) : user.subscriptionStartedAt,
        subscriptionEndsAt,
        googlePlayProductId: productId,
        googlePlayPurchaseToken: purchaseToken,
        razorpaySubscriptionId: null
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
        subscriptionSource: subscriptionPlan ? 'razorpay' : undefined,
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
