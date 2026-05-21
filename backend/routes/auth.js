import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomInt, createHmac } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { ensureSubscriptionDefaults, isFreeEmail } from '../middleware/subscription.js';
import { sendOtpEmail } from '../services/email.js';

const router = express.Router();
const prisma = new PrismaClient();
const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const hashOtp = (email, purpose, otp) => {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'your-secret-key';
  return createHmac('sha256', secret)
    .update(`${email}:${purpose}:${otp}`)
    .digest('hex');
};

const generateOtp = () => String(randomInt(100000, 1000000));

const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  firmName: true,
  createdAt: true,
  trialEndsAt: true,
  subscriptionStatus: true,
  subscriptionPlan: true,
  subscriptionEndsAt: true,
  freeOverride: true
};

const buildAuthResponse = async (userId) => {
  const normalizedUser = await ensureSubscriptionDefaults(userId);
  const token = jwt.sign(
    { userId: normalizedUser.id, email: normalizedUser.email },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );

  return {
    user: {
      id: normalizedUser.id,
      email: normalizedUser.email,
      name: normalizedUser.name,
      firmName: normalizedUser.firmName,
      trialEndsAt: normalizedUser.trialEndsAt,
      subscriptionStatus: normalizedUser.subscriptionStatus,
      subscriptionPlan: normalizedUser.subscriptionPlan,
      subscriptionEndsAt: normalizedUser.subscriptionEndsAt,
      freeOverride: normalizedUser.freeOverride
    },
    token
  };
};

// Register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name, firmName } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || email.split('@')[0],
        firmName: firmName || null,
        trialEndsAt: null,
        subscriptionStatus: null,
        freeOverride: isFreeEmail(email)
      },
      select: {
        ...publicUserSelect
      }
    });

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      user,
      token
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    res.json(await buildAuthResponse(user.id));
  } catch (error) {
    next(error);
  }
});

router.post('/otp/request', [
  body('email').isEmail().normalizeEmail(),
  body('purpose').isIn(['login', 'reset'])
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const email = normalizeEmail(req.body.email);
    const purpose = req.body.purpose;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'No account found with this email' });
    }

    const recentOtp = await prisma.otpCode.findFirst({
      where: {
        email,
        purpose,
        consumedAt: null,
        createdAt: { gte: new Date(Date.now() - 60 * 1000) }
      },
      orderBy: { createdAt: 'desc' }
    });
    if (recentOtp) {
      return res.status(429).json({ error: 'Please wait before requesting another OTP' });
    }

    await prisma.otpCode.updateMany({
      where: { email, purpose, consumedAt: null },
      data: { consumedAt: new Date() }
    });

    const otp = generateOtp();
    await prisma.otpCode.create({
      data: {
        userId: user.id,
        email,
        purpose,
        codeHash: hashOtp(email, purpose, otp),
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
      }
    });

    await sendOtpEmail(email, otp);
    res.json({ ok: true, message: 'OTP sent' });
  } catch (error) {
    if (error?.message?.includes('SMTP_')) {
      return res.status(503).json({ error: 'Email OTP is not configured yet. Please contact support.' });
    }
    next(error);
  }
});

router.post('/otp/verify', [
  body('email').isEmail().normalizeEmail(),
  body('purpose').isIn(['login', 'reset']),
  body('otp').isLength({ min: 4, max: 8 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const email = normalizeEmail(req.body.email);
    const { purpose, otp } = req.body;

    const otpRecord = await prisma.otpCode.findFirst({
      where: {
        email,
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!otpRecord) {
      return res.status(400).json({ error: 'OTP expired or not found' });
    }
    if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many incorrect OTP attempts' });
    }

    const isValid = otpRecord.codeHash === hashOtp(email, purpose, otp);
    if (!isValid) {
      await prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } }
      });
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() }
    });

    if (purpose === 'reset') {
      const resetToken = jwt.sign(
        { userId: otpRecord.userId, purpose: 'password-reset' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '15m' }
      );
      return res.json({ resetToken });
    }

    res.json(await buildAuthResponse(otpRecord.userId));
  } catch (error) {
    next(error);
  }
});

router.post('/password/reset', [
  body('resetToken').isString(),
  body('password').isLength({ min: 6 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const decoded = jwt.verify(req.body.resetToken, process.env.JWT_SECRET || 'your-secret-key');
    if (decoded.purpose !== 'password-reset' || !decoded.userId) {
      return res.status(401).json({ error: 'Invalid reset token' });
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    await prisma.user.update({
      where: { id: decoded.userId },
      data: { password: hashedPassword }
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(401).json({ error: 'Reset link expired. Please request a new OTP.' });
  }
});

// Get current user
router.get('/me', async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        ...publicUserSelect
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const normalizedUser = await ensureSubscriptionDefaults(user.id);
    res.json({
      user: {
        id: normalizedUser.id,
        email: normalizedUser.email,
        name: normalizedUser.name,
        firmName: normalizedUser.firmName,
        createdAt: normalizedUser.createdAt,
        trialEndsAt: normalizedUser.trialEndsAt,
        subscriptionStatus: normalizedUser.subscriptionStatus,
        subscriptionPlan: normalizedUser.subscriptionPlan,
        subscriptionEndsAt: normalizedUser.subscriptionEndsAt,
        freeOverride: normalizedUser.freeOverride
      }
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;

