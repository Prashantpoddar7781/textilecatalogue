import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult, query } from 'express-validator';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all designs (with optional auth for user-specific filtering)
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const {
      fabric,
      minPrice,
      maxPrice,
      search,
      sortBy = 'newest',
      page = 1,
      limit = 50
    } = req.query;

    const userId = req.user?.userId;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {};
    
    if (userId) {
      where.userId = userId;
    }

    const catalogue = req.query.catalogue;
    if (catalogue && catalogue !== 'All') {
      where.catalogueId = catalogue;
    }

    if (fabric && fabric !== 'All') {
      where.fabric = fabric;
    }

    if (minPrice || maxPrice) {
      where.retailPrice = {};
      if (minPrice) where.retailPrice.gte = parseFloat(minPrice);
      if (maxPrice) where.retailPrice.lte = parseFloat(maxPrice);
    }

    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { fabric: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Build orderBy
    let orderBy = {};
    switch (sortBy) {
      case 'price-low':
        orderBy = { retailPrice: 'asc' };
        break;
      case 'price-high':
        orderBy = { retailPrice: 'desc' };
        break;
      case 'newest':
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    // Get designs and count
    const [designs, total] = await Promise.all([
      prisma.design.findMany({
        where,
        orderBy,
        skip,
        take: limitNum,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              firmName: true
            }
          },
          catalogue: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }),
      prisma.design.count({ where })
    ]);

    res.json({
      designs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get single design
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const design = await prisma.design.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!design) {
      return res.status(404).json({ error: 'Design not found' });
    }

    // Only allow users to see their own designs if not public
    if (userId && design.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(design);
  } catch (error) {
    next(error);
  }
});

// Create design (requires auth)
router.post('/', authenticateToken, [
  body('image').notEmpty(),
  body('name').optional().trim(),
  body('wholesalePrice').isFloat({ min: 0 }),
  body('retailPrice').isFloat({ min: 0 }),
  body('fabric').notEmpty().trim(),
  body('description').optional().trim(),
  body('catalogueId').optional()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { image, name, wholesalePrice, retailPrice, fabric, description, catalogueId } = req.body;
    const userId = req.user.userId;

    // Verify catalogue belongs to user if provided
    if (catalogueId) {
      const catalogue = await prisma.catalogue.findFirst({
        where: { id: catalogueId, userId }
      });
      if (!catalogue) {
        return res.status(400).json({ error: 'Invalid catalogue' });
      }
    }

    const design = await prisma.design.create({
      data: {
        userId,
        name: name?.trim() || `Design ${new Date().toISOString()}`,
        catalogueId: catalogueId || null,
        image,
        wholesalePrice: parseFloat(wholesalePrice),
        retailPrice: parseFloat(retailPrice),
        fabric,
        description: description || null
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.status(201).json(design);
  } catch (error) {
    next(error);
  }
});

// Update design (requires auth, owner only)
router.put('/:id', authenticateToken, [
  body('wholesalePrice').optional().isFloat({ min: 0 }),
  body('retailPrice').optional().isFloat({ min: 0 }),
  body('fabric').optional().notEmpty().trim(),
  body('description').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.userId;

    // Check ownership
    const existing = await prisma.design.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Design not found' });
    }

    if (existing.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update
    const updateData = {};
    if (req.body.wholesalePrice !== undefined) updateData.wholesalePrice = parseFloat(req.body.wholesalePrice);
    if (req.body.retailPrice !== undefined) updateData.retailPrice = parseFloat(req.body.retailPrice);
    if (req.body.fabric !== undefined) updateData.fabric = req.body.fabric;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.image !== undefined) updateData.image = req.body.image;

    const design = await prisma.design.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.json(design);
  } catch (error) {
    next(error);
  }
});

// Delete design (requires auth, owner only)
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check ownership
    const design = await prisma.design.findUnique({
      where: { id }
    });

    if (!design) {
      return res.status(404).json({ error: 'Design not found' });
    }

    if (design.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.design.delete({
      where: { id }
    });

    res.json({ message: 'Design deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Get unique fabrics (for filter)
router.get('/meta/fabrics', async (req, res, next) => {
  try {
    const fabrics = await prisma.design.findMany({
      select: {
        fabric: true
      },
      distinct: ['fabric']
    });

    res.json({ fabrics: fabrics.map(f => f.fabric) });
  } catch (error) {
    next(error);
  }
});

// Get unique catalogues (for filter)
router.get('/meta/catalogues', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const catalogues = await prisma.catalogue.findMany({
      where: { userId },
      select: {
        id: true,
        name: true
      },
      orderBy: { name: 'asc' }
    });

    res.json({ catalogues });
  } catch (error) {
    next(error);
  }
});

export default router;

