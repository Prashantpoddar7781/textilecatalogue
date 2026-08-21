import express from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { ERP_ACCOUNT_TYPES, defaultAccountTypeForRole, partyRoleForAccountType, normalizeAccountType } from '../constants/accountTypes.js';
import { findOrCreateCustomer, findOrCreateSupplier } from '../utils/partyMaster.js';

const router = express.Router();
const prisma = new PrismaClient();

const optionalString = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

function mapParty(row, role) {
  const name = role === 'customer' ? row.organizationName : row.name;
  return {
    id: row.id,
    role,
    name,
    organizationName: role === 'customer' ? row.organizationName : row.name,
    gstNumber: row.gstNumber || null,
    panNumber: row.panNumber || null,
    mobileNumber: row.mobileNumber || null,
    contactPersonName: row.contactPersonName || null,
    brokerName: role === 'customer' ? (row.agentName || null) : (row.brokerName || null),
    agentName: role === 'customer' ? (row.agentName || null) : (row.brokerName || null),
    accountType: row.accountType || defaultAccountTypeForRole(role),
    accountGroup: row.accountGroup || null,
    address: row.address || null,
    addressLine2: row.addressLine2 || null,
    city: row.city || null,
    state: row.state || null,
    pincode: row.pincode || null,
    graceDays: row.graceDays ?? null,
    remark: row.remark || null,
    msmeType: row.msmeType || null,
    udyamNumber: row.udyamNumber || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

router.get('/account-types', authenticateToken, requireActiveSubscription, (_req, res) => {
  res.json({ accountTypes: ERP_ACCOUNT_TYPES });
});

router.get('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const role = optionalString(req.query.role);
    const q = optionalString(req.query.q)?.toLowerCase();

    const [suppliers, customers] = await Promise.all([
      (!role || role === 'supplier' || role === 'all')
        ? prisma.supplier.findMany({ where: { userId }, orderBy: { name: 'asc' } })
        : Promise.resolve([]),
      (!role || role === 'customer' || role === 'all')
        ? prisma.customer.findMany({ where: { userId }, orderBy: { organizationName: 'asc' } })
        : Promise.resolve([])
    ]);

    let parties = [
      ...suppliers.map(row => mapParty(row, 'supplier')),
      ...customers.map(row => mapParty(row, 'customer'))
    ].sort((a, b) => a.name.localeCompare(b.name));

    if (q) {
      parties = parties.filter(p =>
        p.name.toLowerCase().includes(q)
        || String(p.gstNumber || '').toLowerCase().includes(q)
        || String(p.accountType || '').toLowerCase().includes(q)
      );
    }

    res.json({ parties, accountTypes: ERP_ACCOUNT_TYPES });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const role = optionalString(req.query.role) || 'supplier';
    if (role === 'customer') {
      const customer = await prisma.customer.findFirst({ where: { id: req.params.id, userId } });
      if (!customer) return res.status(404).json({ error: 'Party not found' });
      return res.json({ party: mapParty(customer, 'customer') });
    }
    const supplier = await prisma.supplier.findFirst({ where: { id: req.params.id, userId } });
    if (!supplier) return res.status(404).json({ error: 'Party not found' });
    return res.json({ party: mapParty(supplier, 'supplier') });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, requireActiveSubscription, [
  body('name').trim().notEmpty().withMessage('Party name is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = req.user.userId;
    const accountType = normalizeAccountType(
      req.body.accountType,
      defaultAccountTypeForRole(optionalString(req.body.role) === 'customer' ? 'customer' : 'supplier')
    );
    const role = optionalString(req.body.role) || partyRoleForAccountType(accountType);
    const payload = {
      name: req.body.name,
      organizationName: req.body.name,
      gstNumber: req.body.gstNumber,
      panNumber: req.body.panNumber,
      mobileNumber: req.body.mobileNumber,
      contactPersonName: req.body.contactPersonName,
      brokerName: req.body.brokerName,
      agentName: req.body.brokerName || req.body.agentName,
      accountType,
      accountGroup: req.body.accountGroup,
      address: req.body.address,
      addressLine2: req.body.addressLine2,
      city: req.body.city,
      state: req.body.state,
      pincode: req.body.pincode,
      graceDays: req.body.graceDays,
      remark: req.body.remark,
      msmeType: req.body.msmeType,
      udyamNumber: req.body.udyamNumber
    };

    if (role === 'customer') {
      const customer = await findOrCreateCustomer(prisma, userId, payload);
      return res.status(201).json({ party: mapParty(customer, 'customer') });
    }
    const supplier = await findOrCreateSupplier(prisma, userId, payload);
    return res.status(201).json({ party: mapParty(supplier, 'supplier') });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const role = optionalString(req.body.role) || optionalString(req.query.role) || 'supplier';
    const accountType = req.body.accountType
      ? normalizeAccountType(req.body.accountType, defaultAccountTypeForRole(role === 'customer' ? 'customer' : 'supplier'))
      : undefined;

    if (role === 'customer') {
      const existing = await prisma.customer.findFirst({ where: { id: req.params.id, userId } });
      if (!existing) return res.status(404).json({ error: 'Party not found' });
      const customer = await findOrCreateCustomer(prisma, userId, {
        organizationName: req.body.name || existing.organizationName,
        gstNumber: req.body.gstNumber,
        panNumber: req.body.panNumber,
        mobileNumber: req.body.mobileNumber,
        contactPersonName: req.body.contactPersonName,
        agentName: req.body.brokerName || req.body.agentName,
        accountType: accountType || existing.accountType,
        accountGroup: req.body.accountGroup,
        address: req.body.address,
        addressLine2: req.body.addressLine2,
        city: req.body.city,
        state: req.body.state,
        pincode: req.body.pincode,
        graceDays: req.body.graceDays,
        remark: req.body.remark
      });
      return res.json({ party: mapParty(customer, 'customer') });
    }

    const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) return res.status(404).json({ error: 'Party not found' });
    const supplier = await findOrCreateSupplier(prisma, userId, {
      name: req.body.name || existing.name,
      gstNumber: req.body.gstNumber,
      panNumber: req.body.panNumber,
      mobileNumber: req.body.mobileNumber,
      contactPersonName: req.body.contactPersonName,
      brokerName: req.body.brokerName,
      accountType: accountType || existing.accountType,
      accountGroup: req.body.accountGroup,
      address: req.body.address,
      addressLine2: req.body.addressLine2,
      city: req.body.city,
      state: req.body.state,
      pincode: req.body.pincode,
      graceDays: req.body.graceDays,
      remark: req.body.remark,
      msmeType: req.body.msmeType,
      udyamNumber: req.body.udyamNumber
    });
    return res.json({ party: mapParty(supplier, 'supplier') });
  } catch (error) {
    next(error);
  }
});

export default router;
