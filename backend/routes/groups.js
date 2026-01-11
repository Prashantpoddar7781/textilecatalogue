import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all groups for the authenticated user
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const groups = await prisma.group.findMany({
      where: { userId },
      include: {
        members: {
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(groups);
  } catch (error) {
    next(error);
  }
});

// Get single group with members
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const group = await prisma.group.findFirst({
      where: { id, userId },
      include: {
        members: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found or unauthorized' });
    }

    res.json(group);
  } catch (error) {
    next(error);
  }
});

// Create a new group
router.post('/', authenticateToken, [
  body('name').notEmpty().trim().withMessage('Group name is required'),
  body('members').isArray().withMessage('Members must be an array'),
  body('members.*.name').notEmpty().trim().withMessage('Member name is required'),
  body('members.*.phoneNumber').notEmpty().trim().withMessage('Member phone number is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, members } = req.body;
    const userId = req.user.userId;

    // Validate and format phone numbers
    const formattedMembers = members.map(member => ({
      name: member.name.trim(),
      phoneNumber: member.phoneNumber.replace(/\D/g, '') // Remove non-digits
    }));

    const newGroup = await prisma.group.create({
      data: {
        name: name.trim(),
        userId,
        members: {
          create: formattedMembers
        }
      },
      include: {
        members: true
      }
    });

    res.status(201).json(newGroup);
  } catch (error) {
    next(error);
  }
});

// Update a group
router.put('/:id', authenticateToken, [
  body('name').optional().notEmpty().trim(),
  body('members').optional().isArray()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.userId;
    const { name, members } = req.body;

    // Check ownership
    const existing = await prisma.group.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Group not found or unauthorized' });
    }

    const updateData = {};
    if (name) updateData.name = name.trim();

    // If members are provided, replace all members
    if (members) {
      const formattedMembers = members.map(member => ({
        name: member.name.trim(),
        phoneNumber: member.phoneNumber.replace(/\D/g, '')
      }));

      // Delete existing members and create new ones
      await prisma.groupMember.deleteMany({
        where: { groupId: id }
      });

      updateData.members = {
        create: formattedMembers
      };
    }

    const updatedGroup = await prisma.group.update({
      where: { id },
      data: updateData,
      include: {
        members: true
      }
    });

    res.json(updatedGroup);
  } catch (error) {
    next(error);
  }
});

// Delete a group
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const deletedGroup = await prisma.group.deleteMany({
      where: { id, userId }
    });

    if (deletedGroup.count === 0) {
      return res.status(404).json({ error: 'Group not found or unauthorized' });
    }

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Add member to group
router.post('/:id/members', authenticateToken, [
  body('name').notEmpty().trim().withMessage('Member name is required'),
  body('phoneNumber').notEmpty().trim().withMessage('Phone number is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const userId = req.user.userId;
    const { name, phoneNumber } = req.body;

    // Check ownership
    const group = await prisma.group.findFirst({
      where: { id, userId }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found or unauthorized' });
    }

    const member = await prisma.groupMember.create({
      data: {
        groupId: id,
        name: name.trim(),
        phoneNumber: phoneNumber.replace(/\D/g, '')
      }
    });

    res.status(201).json(member);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Member with this phone number already exists in the group' });
    }
    next(error);
  }
});

// Remove member from group
router.delete('/:id/members/:memberId', authenticateToken, async (req, res, next) => {
  try {
    const { id, memberId } = req.params;
    const userId = req.user.userId;

    // Check ownership
    const group = await prisma.group.findFirst({
      where: { id, userId }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found or unauthorized' });
    }

    const deletedMember = await prisma.groupMember.deleteMany({
      where: { id: memberId, groupId: id }
    });

    if (deletedMember.count === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
