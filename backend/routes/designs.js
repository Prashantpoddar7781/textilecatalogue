import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult, query } from 'express-validator';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { requireActiveSubscription, requireActiveSubscriptionIfAuthenticated, requireDesignCreationAllowance } from '../middleware/subscription.js';

const router = express.Router();
const prisma = new PrismaClient();

/** When the client sends calculatedPrice (e.g. user rounded 103.95 → 104), keep it instead of recomputing from %. */
function resolveAdditionalPriceCalculated(ap, basePriceNum) {
  let fromFormula = basePriceNum;
  if (ap.type === 'percentage') {
    fromFormula = basePriceNum * (1 + ap.value / 100);
  } else if (ap.type === 'fixed') {
    fromFormula = basePriceNum + ap.value;
  }
  const override = ap.calculatedPrice;
  if (override !== undefined && override !== null) {
    const n = typeof override === 'number' ? override : parseFloat(String(override));
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return fromFormula;
}

// Get all designs (with optional auth for user-specific filtering)
router.get('/', optionalAuth, requireActiveSubscriptionIfAuthenticated, async (req, res, next) => {
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
        { name: { contains: search, mode: 'insensitive' } },
        { designCode: { contains: search, mode: 'insensitive' } },
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

// Public route used by barcode scan pages
router.get('/public/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const design = await prisma.design.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        image: true,
        designCode: true,
        basePrice: true,
        wholesalePrice: true,
        retailPrice: true,
        fabric: true,
        description: true,
        catalogue: {
          select: { name: true }
        }
      }
    });

    if (!design) {
      return res.status(404).json({ error: 'Design not found' });
    }

    res.json({
      ...design,
      catalogueName: design.catalogue?.name || null,
      catalogue: undefined
    });
  } catch (error) {
    next(error);
  }
});

// Get single design
router.get('/:id', optionalAuth, requireActiveSubscriptionIfAuthenticated, async (req, res, next) => {
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
router.post('/', authenticateToken, requireDesignCreationAllowance, [
  body('image').notEmpty(),
  body('name').optional().trim(),
  body('basePrice').optional().isFloat({ min: 0 }),
  body('wholesalePrice').optional().isFloat({ min: 0 }),
  body('retailPrice').optional().isFloat({ min: 0 }),
  body('designCode').optional().trim(),
  body('color').optional().trim(),
  body('stockQuantity').optional().isInt(),
  body('stockUnit').optional().isIn(['pcs', 'mtrs']),
  body('pcsPerParcel').optional().isInt({ min: 1 }),
  body('moq').optional().isInt({ min: 0 }),
  body('additionalPrices').optional().isArray(),
  body('costingDetails').optional().isObject(),
  body('aiModels').optional().isArray(),
  body('fabric').notEmpty().trim(),
  body('description').optional().trim(),
  body('catalogueId').optional()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { image, name, basePrice, wholesalePrice: wsPrice, retailPrice: rtPrice, additionalPrices, costingDetails, aiModels, fabric, description, catalogueId, designCode, color, stockQuantity, stockUnit, pcsPerParcel, moq } = req.body;
    const userId = req.user.userId;

    // Validate that at least one price is provided
    if (!basePrice && !rtPrice && !wsPrice) {
      return res.status(400).json({ error: 'Either basePrice or retailPrice must be provided' });
    }

    // Verify catalogue belongs to user if provided
    if (catalogueId) {
      const catalogue = await prisma.catalogue.findFirst({
        where: { id: catalogueId, userId }
      });
      if (!catalogue) {
        return res.status(400).json({ error: 'Invalid catalogue' });
      }
    }

    // Handle backward compatibility: if basePrice not provided, use retailPrice
    let basePriceNum = basePrice ? parseFloat(basePrice) : (rtPrice ? parseFloat(rtPrice) : 0);
    let wholesalePrice = wsPrice ? parseFloat(wsPrice) : basePriceNum;
    let retailPrice = rtPrice ? parseFloat(rtPrice) : basePriceNum;
    
    // If additionalPrices provided, calculate them (preserve client calculatedPrice when sent)
    const processedAdditionalPrices = additionalPrices
      ? additionalPrices.map((ap) => ({
          name: ap.name,
          type: ap.type,
          value: ap.value,
          calculatedPrice: resolveAdditionalPriceCalculated(ap, basePriceNum)
        }))
      : null;

    const design = await prisma.design.create({
      data: {
        userId,
        name: name?.trim() || `Design ${new Date().toISOString()}`,
        catalogueId: catalogueId || null,
        image,
        designCode: designCode || null,
        color: color || null,
        stockQuantity: stockQuantity !== undefined ? parseInt(stockQuantity, 10) : 1000,
        stockUnit: stockUnit === 'mtrs' ? 'mtrs' : 'pcs',
        pcsPerParcel: pcsPerParcel !== undefined ? parseInt(pcsPerParcel, 10) : null,
        moq: moq !== undefined ? parseInt(moq, 10) : null,
        basePrice: basePriceNum,
        additionalPrices: processedAdditionalPrices,
        costingDetails: costingDetails || null,
        aiModels: Array.isArray(aiModels) && aiModels.length > 0 ? aiModels : null,
        wholesalePrice, // For backward compatibility
        retailPrice, // For backward compatibility
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
router.put('/:id', authenticateToken, requireActiveSubscription, [
  body('basePrice').optional().isFloat({ min: 0 }),
  body('wholesalePrice').optional().isFloat({ min: 0 }),
  body('retailPrice').optional().isFloat({ min: 0 }),
  body('designCode').optional().trim(),
  body('color').optional().trim(),
  body('stockQuantity').optional().isInt({ min: 0 }),
  body('stockUnit').optional().isIn(['pcs', 'mtrs']),
  body('pcsPerParcel').optional().isInt({ min: 1 }),
  body('moq').optional().isInt({ min: 0 }),
  body('additionalPrices').optional().isArray(),
  body('costingDetails').optional().isObject(),
  body('aiModels').optional().isArray(),
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

    // Verify catalogue belongs to user if provided
    if (req.body.catalogueId) {
      const catalogue = await prisma.catalogue.findFirst({
        where: { id: req.body.catalogueId, userId }
      });
      if (!catalogue) {
        return res.status(400).json({ error: 'Invalid catalogue' });
      }
    }

    // Update
    const updateData = {};
    if (req.body.name !== undefined) updateData.name = req.body.name?.trim() || null;
    if (req.body.fabric !== undefined) updateData.fabric = req.body.fabric;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.image !== undefined) updateData.image = req.body.image;
    if (req.body.catalogueId !== undefined) updateData.catalogueId = req.body.catalogueId || null;
    if (req.body.designCode !== undefined) updateData.designCode = req.body.designCode || null;
    if (req.body.color !== undefined) updateData.color = req.body.color || null;
    if (req.body.stockQuantity !== undefined) updateData.stockQuantity = parseInt(req.body.stockQuantity, 10);
    if (req.body.stockUnit !== undefined) updateData.stockUnit = req.body.stockUnit === 'mtrs' ? 'mtrs' : 'pcs';
    if (req.body.pcsPerParcel !== undefined) updateData.pcsPerParcel = req.body.pcsPerParcel ? parseInt(req.body.pcsPerParcel, 10) : null;
    if (req.body.moq !== undefined) updateData.moq = req.body.moq ? parseInt(req.body.moq, 10) : null;
    
    // Handle pricing updates with backward compatibility
    if (req.body.basePrice !== undefined) {
      const basePriceNum = parseFloat(req.body.basePrice);
      updateData.basePrice = basePriceNum;
      if (!req.body.wholesalePrice) updateData.wholesalePrice = basePriceNum;
      if (!req.body.retailPrice) updateData.retailPrice = basePriceNum;
    } else if (req.body.retailPrice !== undefined) {
      // Backward compatibility: if only retailPrice provided, use it as basePrice
      const retailPriceNum = parseFloat(req.body.retailPrice);
      updateData.basePrice = retailPriceNum;
      updateData.retailPrice = retailPriceNum;
      if (!req.body.wholesalePrice) updateData.wholesalePrice = retailPriceNum;
    }
    
    if (req.body.wholesalePrice !== undefined) {
      updateData.wholesalePrice = parseFloat(req.body.wholesalePrice);
    }
    if (req.body.retailPrice !== undefined) {
      updateData.retailPrice = parseFloat(req.body.retailPrice);
    }
    
    if (req.body.additionalPrices !== undefined) {
      const basePriceNum = updateData.basePrice ?? existing.basePrice ?? existing.retailPrice ?? 0;
      const processedAdditionalPrices = req.body.additionalPrices.map((ap) => ({
        name: ap.name,
        type: ap.type,
        value: ap.value,
        calculatedPrice: resolveAdditionalPriceCalculated(ap, basePriceNum)
      }));
      updateData.additionalPrices = processedAdditionalPrices;
    }
    if (req.body.costingDetails !== undefined) {
      updateData.costingDetails = req.body.costingDetails || null;
    }
    if (req.body.aiModels !== undefined) {
      updateData.aiModels = Array.isArray(req.body.aiModels) && req.body.aiModels.length > 0 ? req.body.aiModels : null;
    }

    const design = await prisma.design.update({
      where: { id },
      data: updateData,
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
    });

    res.json(design);
  } catch (error) {
    next(error);
  }
});

// Delete design (requires auth, owner only)
router.delete('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
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
router.get('/meta/catalogues', authenticateToken, requireActiveSubscription, async (req, res, next) => {
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

