import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TRIAL_DAYS = Number.parseInt(process.env.TRIAL_DAYS || '7', 10);
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
  return new Date(base.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
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

export const getSubscriptionSnapshot = (user) => {
  const now = new Date();
  const trialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
  const isTrialActive = Boolean(trialEndsAt && trialEndsAt > now);
  const isFree = Boolean(FORCE_FREE || user.freeOverride || isFreeEmail(user.email));
  const isActive = isFree || isTrialActive || isSubscriptionActive(user, now);
  const needsPayment = !isActive;

  return {
    status: user.subscriptionStatus || (isTrialActive ? 'trialing' : null),
    plan: user.subscriptionPlan || null,
    trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
    subscriptionEndsAt: user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt).toISOString() : null,
    isTrialActive,
    isFree,
    isActive,
    needsPayment
  };
};

const ensureTrialForUser = async (user) => {
  if (user.trialEndsAt) return user;
  const trialEndsAt = getTrialEndsAt(user.createdAt);
  return prisma.user.update({
    where: { id: user.id },
    data: {
      trialEndsAt,
      subscriptionStatus: user.subscriptionStatus || 'trialing'
    }
  });
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
    const snapshot = getSubscriptionSnapshot(user);

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

  updatedUser = await ensureTrialForUser(updatedUser);
  return updatedUser;
};
