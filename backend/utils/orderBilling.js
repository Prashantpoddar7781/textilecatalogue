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

export function daysSince(dateValue) {
  if (!dateValue) return 0;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 0;
  const diff = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
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

export async function getPaidAmountsByBillType(prismaClient, userId, billType) {
  const entryType = billType === 'purchase_bill' ? 'payment' : 'receipt';
  const entries = await prismaClient.bankEntry.findMany({
    where: { userId, entryType },
    select: { billAllocations: true }
  });

  const paidByBillId = new Map();
  for (const entry of entries) {
    for (const allocation of normalizeBillAllocations(entry.billAllocations)) {
      if (allocation.billType !== billType) continue;
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

export function mapPurchaseBillToPendingBill(bill, paidByBillId) {
  const billAmount = roundMoney(bill.grandTotal);
  const paidAmount = paidByBillId.get(bill.id) || 0;
  const pendingAmount = roundMoney(Math.max(billAmount - paidAmount, 0));
  const billDate = bill.billDate || bill.createdAt;

  return {
    billId: bill.id,
    billType: 'purchase_bill',
    billNumber: bill.billNumber || bill.voucherNumber || bill.id.slice(-6).toUpperCase(),
    voucherNumber: bill.voucherNumber || bill.billNumber || '-',
    billDate,
    days: daysSince(billDate),
    grace: 0,
    adatDisc: roundMoney(bill.discountAmount),
    billAmount,
    pendingAmount,
    taxableAmount: roundMoney(bill.taxableAmount),
    adjustAmount: 0
  };
}

export function mapOrderToPendingBill(order, paidByOrderId) {
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
  const billAmount = calculateOrderGrandTotal(order);
  const paidAmount = paidByOrderId.get(order.id) || 0;
  const pendingAmount = roundMoney(Math.max(billAmount - paidAmount, 0));
  const billDate = order.orderDate || order.createdAt;

  return {
    billId: order.id,
    billType: 'order',
    billNumber: String(order.invoiceNumber || order.orderNumber || order.id.slice(-6)),
    voucherNumber: order.orderNumber || String(order.invoiceNumber || '-'),
    billDate,
    days: daysSince(billDate),
    grace: 0,
    adatDisc: roundMoney(discountAmount),
    billAmount,
    pendingAmount,
    taxableAmount: billAmount,
    adjustAmount: 0
  };
}
