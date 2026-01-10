import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all catalogues for current user
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const catalogues = await prisma.catalogue.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            designs: true
          }
        }
      }
    });

    res.json({ catalogues });
  } catch (error) {
    next(error);
  }
});

// Create catalogue
router.post('/', authenticateToken, [
  body('name').notEmpty().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const { name } = req.body;

    // Check if catalogue with same name exists for user
    const existing = await prisma.catalogue.findFirst({
      where: {
        userId,
        name: name.trim()
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'Catalogue with this name already exists' });
    }

    const catalogue = await prisma.catalogue.create({
      data: {
        userId,
        name: name.trim()
      }
    });

    res.status(201).json(catalogue);
  } catch (error) {
    next(error);
  }
});

// Get single catalogue with designs
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const catalogue = await prisma.catalogue.findFirst({
      where: {
        id,
        userId
      },
      include: {
        designs: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!catalogue) {
      return res.status(404).json({ error: 'Catalogue not found' });
    }

    res.json(catalogue);
  } catch (error) {
    next(error);
  }
});

// Update catalogue
router.put('/:id', authenticateToken, [
  body('name').optional().notEmpty().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const { id } = req.params;
    const { name } = req.body;

    const catalogue = await prisma.catalogue.findFirst({
      where: { id, userId }
    });

    if (!catalogue) {
      return res.status(404).json({ error: 'Catalogue not found' });
    }

    const updated = await prisma.catalogue.update({
      where: { id },
      data: { name: name?.trim() }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Delete catalogue
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const catalogue = await prisma.catalogue.findFirst({
      where: { id, userId }
    });

    if (!catalogue) {
      return res.status(404).json({ error: 'Catalogue not found' });
    }

    await prisma.catalogue.delete({
      where: { id }
    });

    res.json({ message: 'Catalogue deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
