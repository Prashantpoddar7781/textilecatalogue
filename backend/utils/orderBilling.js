import { isExpensePurchaseType } from '../constants/erpTransactionTypes.js';

export const OPENING_BANK_BALANCE = 1000000;

export const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const normalizeOrderLines = (orderLines) => {
  if (!Array.isArray(orderLines)) return [];
  return orderLines.map((line) => ({
    ...line,
    completed: Boolean(line?.completed),
    completedAt: line?.completedAt || null
  }));
};

export function getOrderPartyName(order) {
  return (order.customer?.organizationName || order.buyerName || '').trim();
}

export function isSalesGoodsReturn(transactionType) {
  return String(transactionType || '').trim().toUpperCase() === 'SALES GOODS RETURN';
}

export function isPurchaseReturn(transactionType) {
  return String(transactionType || '').toUpperCase().includes('PURCHASE RETURN');
}

export function matchesPartyName(order, partyName) {
  if (!partyName) return false;
  const target = partyName.trim().toLowerCase();
  const candidates = [
    order.buyerName,
    order.customer?.organizationName
  ]
    .filter(Boolean)
    .map(value => String(value).trim().toLowerCase());
  return candidates.some(name => name === target || name.includes(target) || target.includes(name));
}

export function calculateOrderDiscountAmount(order) {
  const lines = normalizeOrderLines(order.orderLines);
  const fromLines = roundMoney(lines.reduce((sum, line) => sum + (Number(line.discountAmount) || 0), 0));
  if (fromLines > 0) return fromLines;

  let subtotal = 0;
  if (lines.length > 0) {
    subtotal = lines.reduce((sum, line) => {
      const rate = Number(line.retailPrice ?? line.basePrice ?? 0);
      const qty = parseInt(line.quantity, 10) || 0;
      return sum + rate * qty;
    }, 0);
  }
  const discountRate = Number(order.discountRate) || 0;
  return roundMoney(subtotal * (discountRate / 100));
}

export function calculateOrderGrandTotal(order) {
  const lines = normalizeOrderLines(order.orderLines);
  let subtotal = 0;

  if (lines.length > 0) {
    subtotal = lines.reduce((sum, line) => {
      const rate = Number(line.retailPrice ?? line.basePrice ?? 0);
      const qty = parseInt(line.quantity, 10) || 0;
      return sum + rate * qty;
    }, 0);
  }

  const discountRate = Number(order.discountRate) || 0;
  const shippingCharge = Number(order.shippingCharge) || 0;
  const discountAmount = subtotal * (discountRate / 100);
  return roundMoney(subtotal - discountAmount + shippingCharge);
}

export function daysSince(dateValue, asOfValue = Date.now()) {
  if (!dateValue) return 0;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 0;
  const asOf = asOfValue instanceof Date ? asOfValue : new Date(asOfValue);
  if (Number.isNaN(asOf.getTime())) return 0;
  const diff = asOf.getTime() - date.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export const AGING_BUCKETS = ['0-15', '16-30', '31-45', '46-60', 'Above 60'];

export function agingBucket(days) {
  const value = Math.max(0, Number(days) || 0);
  if (value <= 15) return '0-15';
  if (value <= 30) return '16-30';
  if (value <= 45) return '31-45';
  if (value <= 60) return '46-60';
  return 'Above 60';
}

/** Prefer ERP line totals when present; fall back to catalogue order formula. */
export function resolveBillAmount(order) {
  const lines = normalizeOrderLines(order.orderLines);
  const lineTotal = lines.reduce((sum, line) => {
    const total = Number(line.totalAmount);
    if (Number.isFinite(total) && total > 0) return sum + total;
    const amount = Number(line.amount);
    const tax = Number(line.taxAmount) || 0;
    if (Number.isFinite(amount) && amount > 0) return sum + amount + tax;
    return sum;
  }, 0);
  if (lineTotal > 0) return roundMoney(lineTotal);
  return calculateOrderGrandTotal(order);
}

export async function allocateNextInvoiceNumber(tx, userId) {
  const result = await tx.order.aggregate({
    where: { userId },
    _max: { invoiceNumber: true }
  });
  return (result._max.invoiceNumber ?? 0) + 1;
}

export function normalizeBillAllocations(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && item.billId);
}

export async function getPaidAmountsByBillType(prismaClient, userId, billType, options = {}) {
  const entryType = billType === 'purchase_bill' ? 'payment' : 'receipt';
  const excludeEntryId = options?.excludeEntryId || null;
  const where = { userId, entryType };
  if (excludeEntryId) where.id = { not: excludeEntryId };
  const entries = await prismaClient.bankEntry.findMany({
    where,
    select: { billAllocations: true }
  });

  const paidByBillId = new Map();
  for (const entry of entries) {
    for (const allocation of normalizeBillAllocations(entry.billAllocations)) {
      if (allocation.billType !== billType) continue;
      if (String(allocation.billType || '').toLowerCase() === 'unadj_payment') continue;
      const current = paidByBillId.get(allocation.billId) || 0;
      paidByBillId.set(allocation.billId, current + roundMoney(allocation.adjustAmount));
    }
  }
  return paidByBillId;
}

export async function getPaidAmountsByOrderId(prismaClient, userId) {
  return getPaidAmountsByBillType(prismaClient, userId, 'order');
}

export function matchesSupplierName(supplierName, partyName) {
  if (!partyName || !supplierName) return false;
  const target = partyName.trim().toLowerCase();
  const source = String(supplierName).trim().toLowerCase();
  return source === target || source.includes(target) || target.includes(source);
}

export function mapPurchaseBillToPendingBill(bill, paidByBillId, asOfValue = Date.now()) {
  const billAmount = roundMoney(bill.grandTotal);
  const paidAmount = paidByBillId.get(bill.id) || 0;
  const pendingAmount = roundMoney(Math.max(billAmount - paidAmount, 0));
  const billDate = bill.billDate || bill.createdAt;
  const displayNumber = bill.typeBillNumber != null
    ? String(bill.typeBillNumber)
    : (bill.billNumber || bill.voucherNumber || bill.id.slice(-6).toUpperCase());
  const days = daysSince(billDate, asOfValue);
  const bucket = agingBucket(days);

  return {
    billId: bill.id,
    billType: 'purchase_bill',
    billNumber: displayNumber,
    transactionType: bill.transactionType || null,
    voucherNumber: bill.voucherNumber || bill.billNumber || '-',
    billDate,
    days,
    agingBucket: bucket,
    grace: 0,
    adatDisc: roundMoney(bill.discountAmount),
    billAmount,
    paidAmount: roundMoney(paidAmount),
    pendingAmount,
    taxableAmount: roundMoney(bill.taxableAmount),
    adjustAmount: 0,
    partyName: bill.supplier?.name || bill.supplierName || '',
    brokerName: bill.agentName || '',
    station: bill.station || '',
    haste: bill.haste || '',
    transportName: bill.transportName || '',
    editPath: isExpensePurchaseType(bill.transactionType)
      ? `/erp/expenses?edit=${bill.id}`
      : `/erp/purchase?edit=${bill.id}`
  };
}

export function mapOrderToPendingBill(order, paidByOrderId, asOfValue = Date.now()) {
  const lines = normalizeOrderLines(order.orderLines);
  const subtotal = lines.length > 0
    ? lines.reduce((sum, line) => {
      const rate = Number(line.retailPrice ?? line.basePrice ?? 0);
      const qty = parseInt(line.quantity, 10) || 0;
      return sum + rate * qty;
    }, 0)
    : 0;
  const discountRate = Number(order.discountRate) || 0;
  const discountAmount = subtotal * (discountRate / 100);
  const billAmount = resolveBillAmount(order);
  const paidAmount = paidByOrderId.get(order.id) || 0;
  const pendingAmount = roundMoney(Math.max(billAmount - paidAmount, 0));
  const billDate = order.orderDate || order.createdAt;
  const displayNumber = order.typeBillNumber != null
    ? String(order.typeBillNumber)
    : String(order.invoiceNumber || order.orderNumber || order.id.slice(-6));
  const days = daysSince(billDate, asOfValue);
  const bucket = agingBucket(days);

  return {
    billId: order.id,
    billType: 'order',
    billNumber: displayNumber,
    transactionType: order.transactionType || null,
    voucherNumber: order.orderNumber || String(order.invoiceNumber || '-'),
    billDate,
    days,
    agingBucket: bucket,
    grace: Number(order.grace) || 0,
    adatDisc: roundMoney(discountAmount),
    billAmount,
    paidAmount: roundMoney(paidAmount),
    pendingAmount,
    taxableAmount: billAmount,
    adjustAmount: 0,
    partyName: getOrderPartyName(order),
    brokerName: order.agentName || '',
    station: order.station || '',
    haste: order.haste || '',
    transportName: order.transportName || '',
    manualType: order.manualType || null,
    editPath: order.manualType === 'erp_sales'
      ? `/erp/sales?edit=${order.id}&kind=bill`
      : undefined
  };
}
