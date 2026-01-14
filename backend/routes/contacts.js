import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all contacts for the authenticated user
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const contacts = await prisma.contact.findMany({
      where: { userId },
      orderBy: { name: 'asc' }
    });
    res.json(contacts);
  } catch (error) {
    next(error);
  }
});

// Get contacts by delivery status
router.get('/status/:status', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { status } = req.params;
    
    const contacts = await prisma.contact.findMany({
      where: { 
        userId,
        deliveryStatus: status
      },
      orderBy: { name: 'asc' }
    });
    res.json(contacts);
  } catch (error) {
    next(error);
  }
});

// Create a new contact
router.post('/', authenticateToken, [
  body('name').notEmpty().trim().withMessage('Contact name is required'),
  body('phoneNumber').notEmpty().trim().withMessage('Phone number is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, phoneNumber, isSaved } = req.body;
    const userId = req.user.userId;

    // Format phone number (remove non-digits)
    const formattedPhone = phoneNumber.replace(/\D/g, '');

    const contact = await prisma.contact.create({
      data: {
        name: name.trim(),
        phoneNumber: formattedPhone,
        isSaved: isSaved || false,
        userId
      }
    });

    res.status(201).json(contact);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Contact with this phone number already exists' });
    }
    next(error);
  }
});

// Update contact (including delivery status)
router.put('/:id', authenticateToken, [
  body('name').optional().trim(),
  body('phoneNumber').optional().trim(),
  body('isSaved').optional().isBoolean(),
  body('deliveryStatus').optional().isIn(['delivered', 'undelivered', 'unknown'])
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.userId;
    const { name, phoneNumber, isSaved, deliveryStatus, lastShared } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber.replace(/\D/g, '');
    if (isSaved !== undefined) updateData.isSaved = isSaved;
    if (deliveryStatus !== undefined) updateData.deliveryStatus = deliveryStatus;
    if (lastShared !== undefined) updateData.lastShared = lastShared ? new Date(lastShared) : null;

    const contact = await prisma.contact.updateMany({
      where: { id, userId },
      data: updateData
    });

    if (contact.count === 0) {
      return res.status(404).json({ error: 'Contact not found or unauthorized' });
    }

    const updated = await prisma.contact.findUnique({ where: { id } });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Bulk update delivery status (after broadcast)
router.post('/update-delivery-status', authenticateToken, [
  body('contacts').isArray().withMessage('Contacts must be an array'),
  body('contacts.*.id').notEmpty(),
  body('contacts.*.deliveryStatus').isIn(['delivered', 'undelivered', 'unknown'])
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { contacts } = req.body;
    const userId = req.user.userId;

    // Update each contact's delivery status
    const updates = contacts.map(({ id, deliveryStatus }) =>
      prisma.contact.updateMany({
        where: { id, userId },
        data: { 
          deliveryStatus,
          lastShared: new Date()
        }
      })
    );

    await Promise.all(updates);

    res.json({ message: 'Delivery status updated successfully' });
  } catch (error) {
    next(error);
  }
});

// Delete a contact
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const deleted = await prisma.contact.deleteMany({
      where: { id, userId }
    });

    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Contact not found or unauthorized' });
    }

    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
