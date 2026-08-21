import { getStateFromGstin } from './gstCalculation.js';
import { extractPanFromGstin, normalizePan, resolvePartyPan } from './tds.js';
import { defaultAccountTypeForRole, normalizeAccountType } from '../constants/accountTypes.js';

const optionalString = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

const optionalInt = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : null;
};

function normalizeName(value) {
  return optionalString(value)?.toLowerCase() || '';
}

async function findSupplierByName(prisma, userId, name) {
  const target = normalizeName(name);
  if (!target) return null;
  const suppliers = await prisma.supplier.findMany({ where: { userId } });
  return suppliers.find(row => normalizeName(row.name) === target) || null;
}

async function findCustomerByName(prisma, userId, name) {
  const target = normalizeName(name);
  if (!target) return null;
  const customers = await prisma.customer.findMany({ where: { userId } });
  return customers.find(row => normalizeName(row.organizationName) === target) || null;
}

function resolvePanPayload(payload = {}) {
  const gstNumber = optionalString(payload.gstNumber) || optionalString(payload.partyGstin);
  const panNumber = resolvePartyPan({
    panNumber: optionalString(payload.panNumber),
    gstNumber
  }) || null;
  return { gstNumber, panNumber: panNumber ? normalizePan(panNumber) : null };
}

export async function findOrCreateSupplier(prisma, userId, payload = {}) {
  const name = optionalString(payload.name);
  if (!name) return null;

  const { gstNumber, panNumber } = resolvePanPayload(payload);
  const fromGst = gstNumber ? getStateFromGstin(gstNumber) : { stateName: '' };

  let existing = null;
  if (gstNumber) {
    existing = await prisma.supplier.findFirst({ where: { userId, gstNumber } });
  }
  if (!existing) {
    existing = await findSupplierByName(prisma, userId, name);
  }

  const data = {
    name,
    gstNumber,
    panNumber,
    mobileNumber: optionalString(payload.mobileNumber),
    address: optionalString(payload.address),
    addressLine2: optionalString(payload.addressLine2),
    city: optionalString(payload.city),
    state: optionalString(payload.state) || fromGst.stateName || null,
    pincode: optionalString(payload.pincode),
    msmeType: optionalString(payload.msmeType),
    udyamNumber: optionalString(payload.udyamNumber),
    accountType: optionalString(payload.accountType)
      ? normalizeAccountType(payload.accountType, defaultAccountTypeForRole('supplier'))
      : null,
    accountGroup: optionalString(payload.accountGroup),
    graceDays: optionalInt(payload.graceDays),
    brokerName: optionalString(payload.brokerName),
    contactPersonName: optionalString(payload.contactPersonName),
    remark: optionalString(payload.remark)
  };

  if (existing) {
    return prisma.supplier.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        gstNumber: data.gstNumber || existing.gstNumber,
        panNumber: data.panNumber || existing.panNumber || extractPanFromGstin(data.gstNumber || existing.gstNumber) || null,
        mobileNumber: data.mobileNumber || existing.mobileNumber,
        address: data.address || existing.address,
        addressLine2: data.addressLine2 || existing.addressLine2,
        city: data.city || existing.city,
        state: data.state || existing.state,
        pincode: data.pincode || existing.pincode,
        msmeType: data.msmeType || existing.msmeType,
        udyamNumber: data.udyamNumber || existing.udyamNumber,
        accountType: data.accountType || existing.accountType || defaultAccountTypeForRole('supplier'),
        accountGroup: data.accountGroup || existing.accountGroup,
        graceDays: data.graceDays ?? existing.graceDays,
        brokerName: data.brokerName || existing.brokerName,
        contactPersonName: data.contactPersonName || existing.contactPersonName,
        remark: data.remark || existing.remark
      }
    });
  }

  return prisma.supplier.create({
    data: {
      userId,
      ...data,
      accountType: data.accountType || defaultAccountTypeForRole('supplier')
    }
  });
}

export async function findOrCreateCustomer(prisma, userId, payload = {}) {
  const organizationName = optionalString(payload.organizationName) || optionalString(payload.name);
  if (!organizationName) return null;

  const { gstNumber, panNumber } = resolvePanPayload(payload);
  let existing = null;
  if (gstNumber) {
    existing = await prisma.customer.findFirst({ where: { userId, gstNumber } });
  }
  if (!existing) {
    existing = await findCustomerByName(prisma, userId, organizationName);
  }

  const data = {
    organizationName,
    gstNumber,
    panNumber,
    contactPersonName: optionalString(payload.contactPersonName),
    mobileNumber: optionalString(payload.mobileNumber),
    agentName: optionalString(payload.agentName) || optionalString(payload.brokerName),
    category: optionalString(payload.category),
    accountType: optionalString(payload.accountType)
      ? normalizeAccountType(payload.accountType, defaultAccountTypeForRole('customer'))
      : null,
    accountGroup: optionalString(payload.accountGroup),
    address: optionalString(payload.address),
    addressLine2: optionalString(payload.addressLine2),
    graceDays: optionalInt(payload.graceDays),
    remark: optionalString(payload.remark),
    state: optionalString(payload.state),
    city: optionalString(payload.city),
    pincode: optionalString(payload.pincode),
    discountRate: payload.discountRate != null ? Number(payload.discountRate) : null
  };

  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data: {
        organizationName: data.organizationName,
        gstNumber: data.gstNumber || existing.gstNumber,
        panNumber: data.panNumber || existing.panNumber || extractPanFromGstin(data.gstNumber || existing.gstNumber) || null,
        contactPersonName: data.contactPersonName || existing.contactPersonName,
        mobileNumber: data.mobileNumber || existing.mobileNumber,
        agentName: data.agentName || existing.agentName,
        category: data.category || existing.category,
        accountType: data.accountType || existing.accountType || defaultAccountTypeForRole('customer'),
        accountGroup: data.accountGroup || existing.accountGroup,
        address: data.address || existing.address,
        addressLine2: data.addressLine2 || existing.addressLine2,
        graceDays: data.graceDays ?? existing.graceDays,
        remark: data.remark || existing.remark,
        state: data.state || existing.state,
        city: data.city || existing.city,
        pincode: data.pincode || existing.pincode,
        discountRate: data.discountRate ?? existing.discountRate
      }
    });
  }

  return prisma.customer.create({
    data: {
      userId,
      ...data,
      accountType: data.accountType || defaultAccountTypeForRole('customer')
    }
  });
}

export async function resolveSupplierForEntry(prisma, userId, input = {}) {
  const supplierId = optionalString(input.supplierId);
  if (supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, userId } });
    if (supplier) return supplier;
  }

  const partyName = optionalString(input.partyName);
  if (!partyName) return null;

  const partyGstin = optionalString(input.partyGstin);
  const fromGst = partyGstin ? getStateFromGstin(partyGstin) : { stateName: '' };

  return findOrCreateSupplier(prisma, userId, {
    name: partyName,
    gstNumber: partyGstin,
    panNumber: optionalString(input.panNumber),
    state: optionalString(input.placeOfSupply) || fromGst.stateName || null,
    msmeType: optionalString(input.partyMsme)
  });
}

export async function resolveCustomerForEntry(prisma, userId, input = {}) {
  const customerId = optionalString(input.customerId);
  if (customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, userId } });
    if (customer) return customer;
  }

  const organizationName = optionalString(input.partyName)
    || optionalString(input.buyerName)
    || optionalString(input.organizationName);
  if (!organizationName) return null;

  return findOrCreateCustomer(prisma, userId, {
    organizationName,
    gstNumber: optionalString(input.gstNumber),
    state: optionalString(input.state),
    agentName: optionalString(input.agentName),
    mobileNumber: optionalString(input.mobileNumber)
  });
}

export async function ensurePartyMaster(prisma, userId, { partyType, partyName, ...details }) {
  const name = optionalString(partyName);
  if (!name || partyType === 'other') {
    return { partyType: partyType || 'other', partyName: name };
  }

  if (partyType === 'customer') {
    const customer = await resolveCustomerForEntry(prisma, userId, { partyName: name, ...details });
    return {
      partyType: 'customer',
      partyName: customer?.organizationName || name,
      customerId: customer?.id || null
    };
  }

  if (partyType === 'supplier') {
    const supplier = await resolveSupplierForEntry(prisma, userId, { partyName: name, ...details });
    return {
      partyType: 'supplier',
      partyName: supplier?.name || name,
      supplierId: supplier?.id || null
    };
  }

  return { partyType, partyName: name };
}

export async function ensureMillParty(prisma, userId, millName) {
  const name = optionalString(millName);
  if (!name) return null;

  const existingCustomer = await findCustomerByName(prisma, userId, name);
  if (existingCustomer) return existingCustomer;

  const existingSupplier = await findSupplierByName(prisma, userId, name);
  if (existingSupplier) return existingSupplier;

  return findOrCreateCustomer(prisma, userId, { organizationName: name });
}
