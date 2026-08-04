import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const FREE_DESIGN_LIMIT = Number.parseInt(process.env.FREE_DESIGN_LIMIT || '8', 10);
const FORCE_FREE = process.env.FORCE_FREE === 'true';
const DEFAULT_FREE_EMAILS = [
  'sunitapoddar95@gmail.com',
  'vibhorag91@gmail.com',
  'raghavfashion2018@gmail.com'
];
const FREE_EMAILS = new Set(
  (process.env.FREE_EMAILS || DEFAULT_FREE_EMAILS.join(','))
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
);

/** Extended free trials: email -> { designLimit, durationMonths } */
const PROMO_ACCOUNTS = {
  'shreelaxminathsarees@gmail.com': { designLimit: 120, durationMonths: 2 }
};

export const PRICING_PLANS = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: 599,
    currency: 'INR',
    interval: 'month'
  },
  {
    id: 'annual',
    name: 'Annual',
    price: 6499,
    currency: 'INR',
    interval: 'year'
  }
];

export const getTrialEndsAt = (createdAt) => {
  const base = createdAt ? new Date(createdAt) : new Date();
  return base;
};

export const isFreeEmail = (email) => {
  if (!email) return false;
  return FREE_EMAILS.has(String(email).toLowerCase());
};

export const getPromoConfig = (email) => {
  if (!email) return null;
  return PROMO_ACCOUNTS[String(email).toLowerCase()] || null;
};

export const isPromoTrialActive = (user, now = new Date()) => {
  const promo = getPromoConfig(user?.email);
  if (!promo || !user?.trialEndsAt) return false;
  return new Date(user.trialEndsAt) > now;
};

export const getEffectiveDesignLimit = (user) => {
  const promo = getPromoConfig(user?.email);
  return promo ? promo.designLimit : FREE_DESIGN_LIMIT;
};

const isSubscriptionActive = (user, now) => {
  if (user.subscriptionStatus === 'active' && !user.subscriptionEndsAt) return true;
  if (!['active', 'cancelled'].includes(user.subscriptionStatus)) return false;
  if (!user.subscriptionEndsAt) return false;
  return new Date(user.subscriptionEndsAt) > now;
};

export const getSubscriptionSnapshot = (user, designCount = 0) => {
  const now = new Date();
  const promo = getPromoConfig(user.email);
  const effectiveLimit = getEffectiveDesignLimit(user);
  const promoTrialActive = isPromoTrialActive(user, now);
  const isFree = Boolean(FORCE_FREE || user.freeOverride || isFreeEmail(user.email));
  const isPaidActive = isSubscriptionActive(user, now);
  const freeDesignsRemaining = Math.max(effectiveLimit - designCount, 0);

  const isPromoAllowanceActive = Boolean(
    promo && promoTrialActive && !isPaidActive && designCount <= effectiveLimit
  );
  const isStandardFreeAllowanceActive = Boolean(
    !promo && !isPaidActive && designCount < FREE_DESIGN_LIMIT
  );
  const isFreeDesignAllowanceActive = isPromoAllowanceActive || isStandardFreeAllowanceActive;
  const isActive = isFree || isPaidActive || isFreeDesignAllowanceActive;
  const needsPayment = !isActive;
  const promoExpired = Boolean(promo && user.trialEndsAt && !promoTrialActive && !isPaidActive && !isFree);

  return {
    status: user.subscriptionStatus || (isFreeDesignAllowanceActive ? 'free_designs' : null),
    plan: user.subscriptionPlan || null,
    source: user.subscriptionSource || null,
    trialEndsAt: user.trialEndsAt ? new Date(user.trialEndsAt).toISOString() : null,
    subscriptionEndsAt: user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt).toISOString() : null,
    isTrialActive: promoTrialActive,
    isFree,
    isActive,
    needsPayment,
    promoExpired,
    designCount,
    freeDesignLimit: effectiveLimit,
    freeDesignsRemaining,
    isFreeDesignAllowanceActive
  };
};

export const ensurePromoTrial = async (user) => {
  const promo = getPromoConfig(user.email);
  if (!promo || user.trialEndsAt || isFreeEmail(user.email) || user.freeOverride) {
    return user;
  }

  const trialEndsAt = new Date();
  trialEndsAt.setMonth(trialEndsAt.getMonth() + promo.durationMonths);

  return prisma.user.update({
    where: { id: user.id },
    data: { trialEndsAt }
  });
};

const getDesignCount = (userId) => {
  return prisma.design.count({ where: { userId } });
};

const prepareUserForSubscriptionCheck = async (user) => {
  let nextUser = user;
  if (isFreeEmail(user.email) && !user.freeOverride) {
    nextUser = await prisma.user.update({
      where: { id: user.id },
      data: { freeOverride: true }
    });
  }
  return ensurePromoTrial(nextUser);
};

export const requireActiveSubscription = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user = await prepareUserForSubscriptionCheck(user);
    const designCount = await getDesignCount(user.id);
    const snapshot = getSubscriptionSnapshot(user, designCount);

    if (!snapshot.isActive) {
      const message = snapshot.promoExpired
        ? 'Your 2-month free access has ended. Please subscribe to continue.'
        : 'Subscription required';
      return res.status(402).json({
        error: message,
        subscription: snapshot
      });
    }

    req.subscription = snapshot;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireActiveSubscriptionIfAuthenticated = async (req, res, next) => {
  if (!req.user?.userId) {
    return next();
  }
  return requireActiveSubscription(req, res, next);
};

export const requireDesignCreationAllowance = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user = await prepareUserForSubscriptionCheck(user);
    const designCount = await getDesignCount(user.id);
    const snapshot = getSubscriptionSnapshot(user, designCount);
    const now = new Date();
    const promo = getPromoConfig(user.email);
    const promoTrialActive = isPromoTrialActive(user, now);
    const hasPaidOrFreeAccess = snapshot.isFree || isSubscriptionActive(user, now);

    if (!hasPaidOrFreeAccess && promo && !promoTrialActive) {
      return res.status(402).json({
        error: 'Your 2-month free access has ended. Please subscribe to add more designs.',
        subscription: {
          ...snapshot,
          isActive: false,
          needsPayment: true,
          freeDesignsRemaining: 0,
          isFreeDesignAllowanceActive: false
        }
      });
    }

    const effectiveLimit = getEffectiveDesignLimit(user);
    if (!hasPaidOrFreeAccess && designCount >= effectiveLimit) {
      return res.status(402).json({
        error: `Free design limit reached. Upgrade to add more than ${effectiveLimit} designs.`,
        subscription: {
          ...snapshot,
          isActive: false,
          needsPayment: true,
          freeDesignsRemaining: 0,
          isFreeDesignAllowanceActive: false
        }
      });
    }

    req.subscription = snapshot;
    next();
  } catch (error) {
    next(error);
  }
};

export const ensureSubscriptionDefaults = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return prepareUserForSubscriptionCheck(user);
};
