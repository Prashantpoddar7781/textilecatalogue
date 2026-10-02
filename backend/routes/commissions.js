import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { findOrCreateSupplier } from '../utils/partyMaster.js';
import { allocateNextTypeBillNumber } from '../utils/transactionBilling.js';
import { orderTaxableAmount, roundMoney } from '../utils/orderBilling.js';
import { getStateCodeFromName, getStateFromGstin } from '../utils/gstCalculation.js';
import {
  COMMISSION_ACCOUNT,
  COMMISSION_SERIES,
  COMMISSION_TDS_ACCOUNT,
  commissionEditPath,
  commissionRule,
  computeCommissionAmounts,
  sameName
} from '../utils/commission.js';

const router = express.Router();
const prisma = new PrismaClient();

const optionalString = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

function stateCodeOf(state, gstin) {
  const fromGst = getStateFromGstin(gstin).stateCode;
  if (fromGst && GST_CODE_OK(fromGst)) return fromGst;
  return getStateCodeFromName(state) || '';
}

function GST_CODE_OK(code) {
  return /^\d{2}$/.test(String(code || '')) && code !== '00';
}

function isInterstate(party, company) {
  const partyCode = stateCodeOf(party?.state, party?.gstNumber);
  const companyCode = stateCodeOf(company?.state, company?.gstNumber);
  if (!partyCode || !companyCode) return false;
  return partyCode !== companyCode;
}

function brokerNamesFor(brokerName, suppliers) {
  const target = String(brokerName || '').trim().toLowerCase();
  const names = new Set();
  if (!target) return names;
  names.add(target);
  const party = suppliers.find(row => sameName(row.name, brokerName));
  const group = String(party?.accountGroup || '').trim().toLowerCase();
  if (group) names.add(group);
  for (const row of suppliers) {
    const rowGroup = String(row.accountGroup || '').trim().toLowerCase();
    const rowName = String(row.name || '').trim().toLowerCase();
    if (!rowName) continue;
    if (rowGroup && (rowGroup === target || (group && rowGroup === group))) names.add(rowName);
    if (rowName === target) names.add(rowName);
  }
  return names;
}

function usedSourceKeys(bills, excludeBillId) {
  const used = new Set();
  for (const bill of bills) {
    if (excludeBillId && bill.id === excludeBillId) continue;
    const sources = bill.extractionJson && Array.isArray(bill.extractionJson.sources)
      ? bill.extractionJson.sources
      : [];
    for (const source of sources) {
      if (source?.bankEntryId && source?.billId) used.add(`${source.bankEntryId}:${source.billId}`);
    }
  }
  return used;
}

function mapCommissionBill(bill) {
  const json = bill.extractionJson && typeof bill.extractionJson === 'object' ? bill.extractionJson : {};
  return {
    id: bill.id,
    transactionType: bill.transactionType,
    typeBillNumber: bill.typeBillNumber,
    billNumber: bill.billNumber,
    voucherNumber: bill.voucherNumber,
    billDate: bill.billDate,
    partyName: bill.supplier?.name || '',
    supplierId: bill.supplierId,
    purchaseAccount: bill.purchaseAccount || COMMISSION_ACCOUNT,
    taxableAmount: bill.taxableAmount,
    cgstAmount: bill.cgstAmount,
    sgstAmount: bill.sgstAmount,
    igstAmount: bill.igstAmount,
    totalTaxAmount: bill.totalTaxAmount,
    grandTotal: bill.grandTotal,
    invoiceValue: json.invoiceValue ?? null,
    tdsPercent: json.tdsPercent ?? null,
    tdsAmount: json.tdsAmount ?? null,
    netPayable: json.netPayable ?? bill.grandTotal,
    interstate: Boolean(json.interstate),
    remarks: bill.remarks || '',
    sources: Array.isArray(json.sources) ? json.sources : [],
    editPath: commissionEditPath(bill.id),
    status: bill.status
  };
}

async function loadSources(userId, brokerName, excludeBillId) {
  const [entries, bills, orders, suppliers] = await Promise.all([
    prisma.bankEntry.findMany({
      where: { userId, entryType: 'receipt' },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }]
    }),
    prisma.purchaseBill.findMany({
      where: { userId, transactionType: COMMISSION_SERIES, status: { not: 'cancelled' } },
      select: { id: true, extractionJson: true }
    }),
    prisma.order.findMany({
      where: { userId, status: 'completed' },
      select: {
        id: true,
        orderLines: true,
        agentName: true,
        buyerName: true,
        orderDate: true,
        typeBillNumber: true,
        invoiceNumber: true,
        orderNumber: true
      }
    }),
    prisma.supplier.findMany({
      where: { userId },
      select: { name: true, accountGroup: true, brokerPercent: true }
    })
  ]);

  const names = brokerNamesFor(brokerName, suppliers);
  const used = usedSourceKeys(bills, excludeBillId);
  const orderById = new Map(orders.map(order => [order.id, order]));
  const rows = [];

  for (const entry of entries) {
    const allocations = Array.isArray(entry.billAllocations) ? entry.billAllocations : [];
    for (const alloc of allocations) {
      if (!alloc?.billId) continue;
      const billType = String(alloc.billType || 'order');
      if (billType !== 'order' && billType !== 'sales_invoice') continue;
      const order = orderById.get(alloc.billId);
      const broker = String(alloc.brokerName || order?.agentName || '').trim();
      if (!names.has(broker.toLowerCase())) continue;
      const key = `${entry.id}:${alloc.billId}`;
      if (used.has(key)) continue;
      const taxable = order
        ? orderTaxableAmount(order)
        : roundMoney(alloc.taxableAmount || alloc.billAmount || 0);
      const stored = Number(alloc.commissionPercent);
      const commissionPercent = Number.isFinite(stored) ? stored : 0;
      const commissionAmount = roundMoney(taxable * commissionPercent / 100);
      rows.push({
        key,
        bankEntryId: entry.id,
        billId: alloc.billId,
        billType,
        billNumber: alloc.billNumber || (order?.typeBillNumber != null ? String(order.typeBillNumber) : ''),
        billDate: alloc.billDate || order?.orderDate || entry.entryDate,
        receiptDate: entry.entryDate,
        partyName: alloc.partyName || order?.buyerName || entry.partyName || '',
        brokerName: broker,
        taxableAmount: taxable,
        receivedAmount: roundMoney(alloc.adjustAmount || 0),
        commissionPercent,
        commissionAmount,
        voucherNumber: entry.voucherNumber || ''
      });
    }
  }

  rows.sort((a, b) => new Date(a.billDate || 0) - new Date(b.billDate || 0));
  return rows;
}

router.get('/default-percent', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const party = String(req.query.party || '').trim();
    const broker = String(req.query.broker || '').trim();
    const entries = await prisma.bankEntry.findMany({
      where: { userId, entryType: 'receipt' },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      take: 400
    });
    for (const entry of entries) {
      if (party && !sameName(entry.partyName, party)) continue;
      const allocations = Array.isArray(entry.billAllocations) ? entry.billAllocations : [];
      for (const alloc of allocations) {
        if (broker && !sameName(alloc.brokerName, broker)) continue;
        const percent = Number(alloc.commissionPercent);
        if (Number.isFinite(percent) && percent > 0) {
          return res.json({ commissionPercent: percent, source: 'receipt' });
        }
      }
    }
    if (broker) {
      const supplier = await prisma.supplier.findFirst({
        where: { userId, name: { equals: broker, mode: 'insensitive' } },
        select: { brokerPercent: true }
      });
      if (supplier?.brokerPercent != null) {
        return res.json({ commissionPercent: supplier.brokerPercent, source: 'account' });
      }
    }
    res.json({ commissionPercent: null, source: null });
  } catch (error) {
    next(error);
  }
});

router.get('/sources', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const broker = String(req.query.broker || '').trim();
    if (!broker) return res.status(400).json({ error: 'Broker name is required' });
    const rows = await loadSources(req.user.userId, broker, optionalString(req.query.excludeBillId));
    res.json({ rows });
  } catch (error) {
    next(error);
  }
});

router.get('/report', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const from = optionalString(req.query.fromDate);
    const to = optionalString(req.query.toDate);
    const broker = optionalString(req.query.broker);
    const where = { userId, transactionType: COMMISSION_SERIES, status: { not: 'cancelled' } };
    if (from || to) {
      where.billDate = {};
      if (from) where.billDate.gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        where.billDate.lte = end;
      }
    }
    const bills = await prisma.purchaseBill.findMany({
      where,
      include: { supplier: true },
      orderBy: [{ billDate: 'asc' }, { typeBillNumber: 'asc' }]
    });
    const filtered = broker
      ? bills.filter(bill => sameName(bill.supplier?.name, broker) || sameName(bill.supplier?.accountGroup, broker))
      : bills;
    const rows = filtered.map(bill => {
      const mapped = mapCommissionBill(bill);
      const sources = mapped.sources;
      return {
        ...mapped,
        billNos: sources.map(source => source.billNumber).filter(Boolean).join(', '),
        receivedAmount: roundMoney(sources.reduce((sum, source) => sum + (Number(source.receivedAmount) || 0), 0)),
        commissionPercent: sources.length === 1
          ? sources[0].commissionPercent
          : (sources.length ? null : null),
        commissionAmount: mapped.taxableAmount
      };
    });
    const totals = {
      taxableAmount: roundMoney(rows.reduce((sum, row) => sum + (Number(row.taxableAmount) || 0), 0)),
      invoiceValue: roundMoney(rows.reduce((sum, row) => sum + (Number(row.invoiceValue) || 0), 0)),
      tdsAmount: roundMoney(rows.reduce((sum, row) => sum + (Number(row.tdsAmount) || 0), 0)),
      netPayable: roundMoney(rows.reduce((sum, row) => sum + (Number(row.netPayable) || 0), 0)),
      receivedAmount: roundMoney(rows.reduce((sum, row) => sum + (Number(row.receivedAmount) || 0), 0))
    };
    res.json({ rows, totals });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const bill = await prisma.purchaseBill.findFirst({
      where: { id: req.params.id, userId: req.user.userId, transactionType: COMMISSION_SERIES },
      include: { supplier: true }
    });
    if (!bill) return res.status(404).json({ error: 'Commission bill not found' });
    res.json({ bill: mapCommissionBill(bill) });
  } catch (error) {
    next(error);
  }
});

async function buildBillData(userId, body, existingId = null) {
  const partyName = optionalString(body.partyName);
  if (!partyName) {
    const error = new Error('Party name is required');
    error.status = 400;
    throw error;
  }
  const rule = commissionRule();
  const sources = Array.isArray(body.sources) ? body.sources : [];
  const available = await loadSources(userId, partyName, existingId);
  const availableByKey = new Map(available.map(row => [row.key, row]));
  const picked = [];
  for (const source of sources) {
    const key = source.key || `${source.bankEntryId}:${source.billId}`;
    const known = availableByKey.get(key);
    if (!known) {
      const error = new Error('One of the selected bills is already commissioned or is not for this broker');
      error.status = 400;
      throw error;
    }
    const percent = source.commissionPercent != null ? Number(source.commissionPercent) : known.commissionPercent;
    const taxable = known.taxableAmount;
    picked.push({
      ...known,
      commissionPercent: percent,
      commissionAmount: roundMoney(taxable * (Number(percent) || 0) / 100)
    });
  }
  const grossFromSources = roundMoney(picked.reduce((sum, row) => sum + row.commissionAmount, 0));
  const gross = picked.length ? grossFromSources : roundMoney(body.grossAmount);
  if (!(gross > 0)) {
    const error = new Error('Enter a gross amount or select commission bills');
    error.status = 400;
    throw error;
  }

  const supplier = await findOrCreateSupplier(prisma, userId, {
    name: partyName,
    accountType: rule?.partyAccountType || 'BROKER/AGENT'
  });
  const company = await prisma.businessProfile.findUnique({ where: { userId } });
  const interstate = isInterstate(supplier, company);
  const tdsPercent = body.tdsPercent != null && body.tdsPercent !== ''
    ? Number(body.tdsPercent)
    : (rule?.tdsPercent || 5);
  const amounts = computeCommissionAmounts(gross, {
    interstate,
    tdsPercent,
    cgstPercent: rule?.cgstPercent ?? 2.5,
    sgstPercent: rule?.sgstPercent ?? 2.5
  });
  const purchaseAccount = optionalString(body.purchaseAccount)
    || rule?.saleOrPurchaseAccount
    || COMMISSION_ACCOUNT;
  const billDate = body.billDate ? new Date(body.billDate) : new Date();

  return {
    supplier,
    company,
    interstate,
    tdsPercent,
    amounts,
    purchaseAccount,
    billDate,
    picked,
    remarks: optionalString(body.remarks)
  };
}

function extractionOf(built) {
  return {
    kind: 'commission',
    interstate: built.interstate,
    invoiceValue: built.amounts.invoiceValue,
    tdsPercent: built.tdsPercent,
    tdsAmount: built.amounts.tdsAmount,
    tdsAccount: commissionRule()?.tdsAccount || COMMISSION_TDS_ACCOUNT,
    netPayable: built.amounts.netPayable,
    sources: built.picked
  };
}

function billColumns(built, typeBillNumber) {
  const number = typeBillNumber != null ? String(typeBillNumber) : null;
  return {
    supplierId: built.supplier.id,
    billNumber: number,
    billDate: built.billDate,
    voucherNumber: number,
    lineItems: [{
      description: 'Commission',
      hsn: commissionRule()?.defaultHsnCode || '9966',
      quantity: 1,
      rate: built.amounts.taxableAmount,
      taxableAmount: built.amounts.taxableAmount
    }],
    taxableAmount: built.amounts.taxableAmount,
    cgstAmount: built.amounts.cgstAmount,
    sgstAmount: built.amounts.sgstAmount,
    igstAmount: built.amounts.igstAmount,
    totalTaxAmount: built.amounts.totalTaxAmount,
    grandTotal: built.amounts.netPayable,
    transactionType: COMMISSION_SERIES,
    companyName: built.company?.tradeName || built.company?.legalName || null,
    partyGstin: built.supplier.gstNumber || null,
    station: built.supplier.city || null,
    purchaseAccount: built.purchaseAccount,
    remarks: built.remarks,
    gstType: built.interstate ? 'IGST' : 'CGST/SGST',
    extractionJson: extractionOf(built),
    status: 'posted'
  };
}

router.post('/', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const built = await buildBillData(userId, req.body || {});
    const bill = await prisma.$transaction(async (tx) => {
      const typeBillNumber = await allocateNextTypeBillNumber(tx, userId, COMMISSION_SERIES, 'purchase_bill');
      return tx.purchaseBill.create({
        data: {
          userId,
          typeBillNumber,
          ...billColumns(built, typeBillNumber)
        },
        include: { supplier: true }
      });
    });
    res.status(201).json({ bill: mapCommissionBill(bill) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

router.put('/:id', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const existing = await prisma.purchaseBill.findFirst({
      where: { id: req.params.id, userId, transactionType: COMMISSION_SERIES }
    });
    if (!existing) return res.status(404).json({ error: 'Commission bill not found' });
    const built = await buildBillData(userId, req.body || {}, existing.id);
    const bill = await prisma.purchaseBill.update({
      where: { id: existing.id },
      data: billColumns(built, existing.typeBillNumber),
      include: { supplier: true }
    });
    res.json({ bill: mapCommissionBill(bill) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

export default router;
