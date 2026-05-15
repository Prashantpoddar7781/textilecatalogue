import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const FREE_DESIGN_LIMIT = Number.parseInt(process.env.FREE_DESIGN_LIMIT || '8', 10);
const FORCE_FREE = process.env.FORCE_FREE === 'true';
const DEFAULT_FREE_EMAILS = ['sunitapoddar95@gmail.com'];
const FREE_EMAILS = new Set(
  (process.env.FREE_EMAILS || DEFAULT_FREE_EMAILS.join(','))
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
);

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

const isSubscriptionActive = (user, now) => {
  if (user.subscriptionStatus === 'active' && !user.subscriptionEndsAt) return true;
  if (!['active', 'cancelled'].includes(user.subscriptionStatus)) return false;
  if (!user.subscriptionEndsAt) return false;
  return new Date(user.subscriptionEndsAt) > now;
};

export const getSubscriptionSnapshot = (user, designCount = 0) => {
  const now = new Date();
  const isFree = Boolean(FORCE_FREE || user.freeOverride || isFreeEmail(user.email));
  const isPaidActive = isSubscriptionActive(user, now);
  const freeDesignsRemaining = Math.max(FREE_DESIGN_LIMIT - designCount, 0);
  const isFreeDesignAllowanceActive = !isPaidActive && designCount <= FREE_DESIGN_LIMIT;
  const isActive = isFree || isPaidActive || isFreeDesignAllowanceActive;
  const needsPayment = !isActive;

  return {
    status: user.subscriptionStatus || (isFreeDesignAllowanceActive ? 'free_designs' : null),
    plan: user.subscriptionPlan || null,
    source: user.subscriptionSource || null,
    trialEndsAt: null,
    subscriptionEndsAt: user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt).toISOString() : null,
    isTrialActive: false,
    isFree,
    isActive,
    needsPayment,
    designCount,
    freeDesignLimit: FREE_DESIGN_LIMIT,
    freeDesignsRemaining,
    isFreeDesignAllowanceActive
  };
};

const ensureTrialForUser = async (user) => {
  return user;
};

const getDesignCount = (userId) => {
  return prisma.design.count({ where: { userId } });
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

    if (isFreeEmail(user.email) && !user.freeOverride) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { freeOverride: true }
      });
    }

    user = await ensureTrialForUser(user);
    const designCount = await getDesignCount(user.id);
    const snapshot = getSubscriptionSnapshot(user, designCount);

    if (!snapshot.isActive) {
      return res.status(402).json({
        error: 'Subscription required',
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

    if (isFreeEmail(user.email) && !user.freeOverride) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { freeOverride: true }
      });
    }

    const designCount = await getDesignCount(user.id);
    const snapshot = getSubscriptionSnapshot(user, designCount);
    const hasPaidOrFreeAccess = snapshot.isFree || isSubscriptionActive(user, new Date());

    if (!hasPaidOrFreeAccess && designCount >= FREE_DESIGN_LIMIT) {
      return res.status(402).json({
        error: `Free design limit reached. Upgrade to add more than ${FREE_DESIGN_LIMIT} designs.`,
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

  let updatedUser = user;
  if (isFreeEmail(user.email) && !user.freeOverride) {
    updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { freeOverride: true }
    });
  }

  return updatedUser;
};
