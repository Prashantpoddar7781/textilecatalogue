import { isExpensePurchaseType } from '../constants/erpTransactionTypes.js';
import { isChequeReturnedEntry } from '../constants/bankCashSeries.js';
import { applyInterestFields } from './interestCalculation.js';

export const OPENING_BANK_BALANCE = 1000000;

export const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Nearest rupee. 1000.40 → 1000, 1000.50 → 1001. Journals are not passed through this. */
export function roundRupee(value) {
  const n = roundMoney(value);
  if (!Number.isFinite(n) || n === 0) return 0;
  return Math.round(n + Math.sign(n) * 1e-9);
}

/** TDS always goes to the next rupee. 541.01 → 542. An exact rupee stays. */
export function roundTdsRupee(value) {
  const n = roundMoney(value);
  if (!(n > 0)) return 0;
  return Math.ceil(n - 1e-9);
}

export function isEmpireTagged(row) {
  return /\[E:/i.test(String(row?.remarks || ''));
}

/** BILLS.paid = Y. Empire keeps that bill off outstanding even when this year's receipts do not name it. */
export function empireMarkedSettled(row) {
  const raw = row?.einvoiceRaw;
  return Boolean(raw && typeof raw === 'object' && !Array.isArray(raw) && raw.empirePaid === true);
}

function isRoundableSaleBill(order) {
  const type = String(order?.transactionType || '').trim().toUpperCase();
  if (!type || type === 'SALES ORDERS') return false;
  return true;
}

/** Sale, purchase, and note nets. Journals are not passed through this. */
export function postedBillRupee(amount) {
  return roundRupee(amount);
}

/**
 * Nearest-rupee bill, and a difference under ₹1 against what was received is
 * the round-off. That bill is settled. A real balance of ₹1 or more stays.
 */
export function applyBillRoundOff(exactAmount, paidAmount) {
  const exact = roundMoney(exactAmount);
  const billAmount = roundRupee(exact);
  const paid = roundMoney(paidAmount);
  const shortOfExact = roundMoney(exact - paid);
  const shortOfRounded = roundMoney(billAmount - paid);
  const settled = Math.abs(shortOfExact) < 1 || Math.abs(shortOfRounded) < 1;
  if (settled) {
    return { billAmount, paidAmount: billAmount, pendingAmount: 0 };
  }
  return {
    billAmount,
    paidAmount: paid,
    pendingAmount: roundMoney(Math.max(shortOfRounded, 0))
  };
}

export function coversRoundedBill(billAmount, paidAmount) {
  return roundMoney(paidAmount) + 0.999 >= roundMoney(billAmount);
}

export function postedPurchaseAmount(bill) {
  return postedBillRupee(bill?.grandTotal, bill);
}

export function postedNoteAmount(note) {
  return postedBillRupee(
    note?.netAmountAfterTds || note?.netAmount || note?.grossAmount,
    note
  );
}

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

/**
 * Amount that hits the party for a sale or sales return.
 * A live bill stores its discount on the order, so the party is posted at the
 * net grand total plus that discount, and the discount is its own credit.
 * An imported Empire bill stores the cash figure (invoice minus bill discount)
 * in shippingCharge, so the grand total is already net while the line totals
 * are the full invoice. That discount is already a DISCOUNT A/C voucher, so
 * the party is posted at the line total and no second discount is added.
 */
function exactPostedSaleAmount(order) {
  const grand = calculateOrderGrandTotal(order);
  const bill = exactBillAmount(order);
  const discount = calculateOrderDiscountAmount(order);
  if (discount > 0.001) {
    return { amount: roundMoney(grand + discount), discount };
  }
  if (bill > grand + 0.05) {
    return { amount: bill, discount: 0 };
  }
  return { amount: grand, discount: 0 };
}

export function resolvePostedSaleAmount(order) {
  const posted = exactPostedSaleAmount(order);
  if (!isRoundableSaleBill(order)) return posted;
  return { amount: roundRupee(posted.amount), discount: posted.discount };
}

/** Bill discounts typed on a receipt. These settle the bill, same as cash. */
export function receiptBillDiscounts(entry) {
  if (String(entry?.entryType || '').toLowerCase() !== 'receipt') return [];
  return normalizeBillAllocations(entry?.billAllocations)
    .filter(line => String(line?.billType || '').toLowerCase() !== 'unadj_payment')
    .filter(line => String(line?.adjustDirection || 'add').toLowerCase() !== 'deduct')
    .map(line => roundMoney(line?.discountAmount))
    .filter(amount => amount > 0.001);
}

/**
 * A receipt discount that already has a same-day journal (imported V1) must
 * not be credited again. The journal may sit on the debit or the credit of
 * the party. Amounts within a rupee are the same discount.
 */
export function discountsNotCoveredByCredits(discounts, credits) {
  const pool = Array.isArray(credits) ? credits : [];
  const open = [];
  for (const amount of discounts || []) {
    const rounded = roundMoney(amount);
    if (!(rounded > 0.001)) continue;
    const index = pool.findIndex(credit => Math.abs(roundMoney(credit) - rounded) <= 1);
    if (index >= 0) pool.splice(index, 1);
    else open.push(rounded);
  }
  return open;
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

/** Taxable value of a sale (before GST). Commission is calculated on this, not on the grand total. */
export function orderTaxableAmount(order) {
  const lines = normalizeOrderLines(order?.orderLines);
  const taxable = lines.reduce((sum, line) => {
    const explicit = Number(line.taxableAmount);
    if (Number.isFinite(explicit) && explicit > 0) return sum + explicit;
    const amount = Number(line.amount);
    if (Number.isFinite(amount) && amount > 0) return sum + amount;
    const rate = Number(line.retailPrice ?? line.basePrice ?? 0);
    const qty = Number(line.quantity) || 0;
    if (rate > 0 && qty > 0) return sum + rate * qty;
    return sum;
  }, 0);
  if (taxable > 0) return roundMoney(taxable);
  return exactBillAmount(order);
}

/** Prefer ERP line totals when present; fall back to catalogue order formula. */
function exactBillAmount(order) {
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

/** Sale / purchase / note bills round to the nearest rupee. Empire imports stay as posted. */
export function resolveBillAmount(order) {
  const exact = exactBillAmount(order);
  if (!isRoundableSaleBill(order)) return exact;
  return roundRupee(exact);
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

/**
 * One Empire voucher is stored once per party line, with the same bill list on each line.
 * Count each bill on that voucher a single time. A blank voucher number stays per row.
 */
export function forEachUniqueBillAllocation(entries, visit) {
  const seen = new Set();
  for (const entry of entries || []) {
    if (isChequeReturnedEntry(entry)) continue;
    const voucherKey = entry?.voucherNumber
      ? `${entry.transactionType || ''}|${entry.voucherNumber}`
      : `id:${entry?.id || ''}`;
    normalizeBillAllocations(entry?.billAllocations).forEach((allocation, index) => {
      const once = `${voucherKey}|${index}|${allocation.billType}|${allocation.billId}|${roundMoney(allocation.adjustAmount)}`;
      if (seen.has(once)) return;
      seen.add(once);
      visit(allocation, entry);
    });
  }
}

/** Bank rows for allocation maths. Editing one line drops every line of that same voucher. */
export async function loadAllocationEntries(prismaClient, userId, options = {}) {
  const excludeEntryId = options.excludeEntryId || null;
  const where = { userId };
  if (options.entryType) where.entryType = options.entryType;
  const entries = await prismaClient.bankEntry.findMany({
    where,
    select: {
      id: true,
      transactionType: true,
      voucherNumber: true,
      entryDate: true,
      billAllocations: true,
      remarks: true
    }
  });
  if (!excludeEntryId) return entries;
  const current = entries.find(entry => entry.id === excludeEntryId)
    || await prismaClient.bankEntry.findFirst({
      where: { id: excludeEntryId },
      select: { id: true, transactionType: true, voucherNumber: true }
    });
  return entries.filter(entry => {
    if (entry.id === excludeEntryId) return false;
    if (
      current?.voucherNumber
      && entry.voucherNumber === current.voucherNumber
      && String(entry.transactionType || '') === String(current.transactionType || '')
    ) {
      return false;
    }
    return true;
  });
}

export async function getPaidAmountsByBillType(prismaClient, userId, billType, options = {}) {
  const entryType = billType === 'purchase_bill' || billType === 'work_receipt' ? 'payment' : 'receipt';
  const entries = await loadAllocationEntries(prismaClient, userId, {
    entryType,
    excludeEntryId: options?.excludeEntryId || null
  });
  const paidByBillId = new Map();
  forEachUniqueBillAllocation(entries, allocation => {
    if (allocation.billType !== billType) return;
    if (String(allocation.billType || '').toLowerCase() === 'unadj_payment') return;
    const current = paidByBillId.get(allocation.billId) || 0;
    const settled = roundMoney((Number(allocation.adjustAmount) || 0) + (Number(allocation.discountAmount) || 0));
    paidByBillId.set(allocation.billId, current + settled);
  });
  return paidByBillId;
}

/** Cash and the discount already stored on the receipt, kept apart so a bill discount is not added twice. */
export async function getPaidAmountsByOrderId(prismaClient, userId, options = {}) {
  const entries = await loadAllocationEntries(prismaClient, userId, {
    entryType: 'receipt',
    excludeEntryId: options?.excludeEntryId || null
  });
  const byId = new Map();
  forEachUniqueBillAllocation(entries, allocation => {
    if (allocation.billType !== 'order') return;
    const current = byId.get(allocation.billId) || { cash: 0, discount: 0 };
    current.cash = roundMoney(current.cash + (Number(allocation.adjustAmount) || 0));
    current.discount = roundMoney(current.discount + (Number(allocation.discountAmount) || 0));
    byId.set(allocation.billId, current);
  });
  return byId;
}

export function matchesSupplierName(supplierName, partyName) {
  if (!partyName || !supplierName) return false;
  const target = partyName.trim().toLowerCase();
  const source = String(supplierName).trim().toLowerCase();
  return source === target || source.includes(target) || target.includes(source);
}

function printedBillLabel(value) {
  const cleaned = String(value || '').replace(/\*/g, '').trim();
  const match = cleaned.match(/^(\d+)/);
  if (!match) return '';
  const number = Number(match[1]);
  if (!Number.isFinite(number) || number <= 0 || number >= 100000) return '';
  return cleaned;
}

/** Work challans are not paid. Work rec bills (lace, suit, and the plain bill) are. */
export function isWorkReceiptBill(transactionType) {
  const type = String(transactionType || '').toUpperCase();
  return type.includes('WORK REC') && type.includes('BILL');
}

/**
 * What is still owed to the job worker: invoice minus TDS.
 * TDS already on the bill is taken to the next rupee, the same way the ledger posts it.
 */
export function workReceiptAmountDue(receipt) {
  const taxable = roundMoney(receipt?.taxableAmount || receipt?.grossAmount || 0);
  const tdsPercent = Number(receipt?.tdsPercent) || 0;
  const storedTds = roundMoney(receipt?.tdsAmount);
  const tdsAmount = storedTds > 0
    ? roundTdsRupee(storedTds)
    : (tdsPercent > 0 ? roundTdsRupee(taxable * tdsPercent / 100) : 0);
  const invoiceValue = roundMoney(
    receipt?.invoiceValue
    || (Number(receipt?.netAfterTds || 0) + tdsAmount)
    || taxable
  );
  return Math.max(roundMoney(invoiceValue - tdsAmount), 0);
}

export function mapWorkReceiptToPendingBill(receipt, paidByReceiptId, asOfValue = Date.now()) {
  const rounded = applyBillRoundOff(workReceiptAmountDue(receipt), paidByReceiptId.get(receipt.id) || 0);
  const billDate = receipt.receiptDate || receipt.createdAt;
  const billNumber = String(receipt.billNo || '').trim()
    || (receipt.voucherNo != null ? String(receipt.voucherNo) : receipt.id.slice(-6).toUpperCase());
  const days = daysSince(billDate, asOfValue);
  return applyInterestFields({
    billId: receipt.id,
    billType: 'work_receipt',
    billNumber,
    transactionType: receipt.transactionType || 'WORK REC. BILLS',
    voucherNumber: receipt.voucherNo != null ? String(receipt.voucherNo) : billNumber,
    billDate,
    days,
    agingBucket: agingBucket(days),
    grace: null,
    adatDisc: roundMoney(receipt.discountAmount),
    billAmount: rounded.billAmount,
    paidAmount: rounded.paidAmount,
    pendingAmount: rounded.pendingAmount,
    taxableAmount: roundMoney(receipt.taxableAmount),
    adjustAmount: 0,
    partyName: receipt.partyName || '',
    brokerName: receipt.brokerName || '',
    station: '',
    haste: '',
    transportName: '',
    editPath: `/erp/work-receipt?edit=${receipt.id}`
  }, {});
}

export function mapPurchaseBillToPendingBill(bill, paidByBillId, asOfValue = Date.now()) {
  const rounded = applyBillRoundOff(bill.grandTotal, paidByBillId.get(bill.id) || 0);
  const billAmount = rounded.billAmount;
  const paidAmount = rounded.paidAmount;
  const pendingAmount = rounded.pendingAmount;
  const billDate = bill.billDate || bill.createdAt;
  const printed = printedBillLabel(bill.supplierBillNo) || printedBillLabel(bill.billNumber);
  const displayNumber = printed
    || (bill.typeBillNumber != null && bill.typeBillNumber > 0 && bill.typeBillNumber < 100000
      ? String(bill.typeBillNumber)
      : (bill.voucherNumber || bill.id.slice(-6).toUpperCase()));
  const days = daysSince(billDate, asOfValue);
  const bucket = agingBucket(days);

  return applyInterestFields({
    billId: bill.id,
    billType: 'purchase_bill',
    billNumber: displayNumber,
    transactionType: bill.transactionType || null,
    voucherNumber: bill.voucherNumber || bill.billNumber || '-',
    billDate,
    days,
    agingBucket: bucket,
    grace: bill.grace,
    adatDisc: roundMoney(bill.discountAmount),
    billAmount,
    paidAmount,
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
  }, bill.supplier || {});
}

/**
 * Discount already on the sale bill. An imported bill stores finalamt − taxable
 * in shippingCharge. When that is below the GST, the gap is the bill discount.
 * The sale bill keeps this amount. Outstanding and the receipt pick list
 * take it out of pending, so a bill whose only remainder is this discount
 * does not appear.
 * A blank shipping charge is not a discount.
 */
function discountPercentThatFits(discount, taxable) {
  if (!(discount > 0.5) || !(taxable > 0)) return 0;
  const raw = (discount / taxable) * 100;
  for (const digits of [0, 2, 4]) {
    const pct = Math.round(raw * (10 ** digits)) / (10 ** digits);
    if (pct > 0 && pct <= 35 && Math.abs((taxable * pct) / 100 - discount) <= 1) return pct;
  }
  return 0;
}

/**
 * Payable amount on a FINISH SALES (GST) bill. The bill discount comes off
 * each line first, and GST is on that taxable amount. Bill 998: gross 30,138,
 * 4% off, taxable 28,932.48, GST 1,446.62, bill 30,379.
 */
export function saleBillFace(order) {
  const lines = normalizeOrderLines(order?.orderLines);
  const gross = lines.reduce((sum, line) => sum + (Number(line.amount) > 0 ? Number(line.amount) : 0), 0);
  const lineDisc = lines.reduce((sum, line) => sum + (Number(line.discountAmount) || 0), 0);
  const footer = lineDisc > 0.5 ? 0 : saleBillDiscount(order);
  const implied = footer > 0.5 ? discountPercentThatFits(footer, gross) : 0;
  const exact = lines.reduce((sum, line) => {
    const amount = Number(line.amount) || 0;
    if (!(amount > 0)) return sum;
    const pct = Number(line.discountPercent) > 0
      ? Number(line.discountPercent)
      : (implied > 0 ? implied : (footer > 0.5 && gross > 0 ? (footer / gross) * 100 : 0));
    const base = roundMoney(amount * (1 - pct / 100));
    const gst = Number(line.gstRate) || 0;
    return sum + base + roundMoney(base * gst / 100);
  }, 0);
  if (!(exact > 0)) return 0;
  return isRoundableSaleBill(order) ? roundRupee(exact) : roundMoney(exact);
}

export function saleBillDiscount(order) {
  const lines = normalizeOrderLines(order?.orderLines);
  const taxable = lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const tax = lines.reduce((sum, line) => sum + (Number(line.taxAmount) || 0), 0);
  const ship = Number(order?.shippingCharge) || 0;
  if (!(ship > 0.5) || ship + 0.5 >= tax) return 0;
  const invoice = isRoundableSaleBill(order) ? roundRupee(exactBillAmount(order)) : roundMoney(exactBillAmount(order));
  const finalAmt = roundMoney(taxable + ship);
  const gap = roundMoney(invoice - finalAmt);
  return gap > 0.5 ? gap : 0;
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
  const rawPaid = paidByOrderId.get(order.id);
  const cashPaid = rawPaid && typeof rawPaid === 'object' ? (Number(rawPaid.cash) || 0) : (Number(rawPaid) || 0);
  const allocationDiscount = rawPaid && typeof rawPaid === 'object' ? (Number(rawPaid.discount) || 0) : 0;
  const footerDisc = saleBillDiscount(order);
  const lineDisc = lines.reduce((sum, line) => sum + (Number(line.discountAmount) || 0), 0);
  const gross = isRoundableSaleBill(order) ? roundRupee(exactBillAmount(order)) : roundMoney(exactBillAmount(order));
  const storedNet = roundMoney(Math.max(gross - (lineDisc > 0.5 ? 0 : footerDisc), 0));
  const face = footerDisc > 0.5 && lineDisc <= 0.5 ? saleBillFace(order) : gross;
  const extraAlloc = roundMoney(Math.max(allocationDiscount - footerDisc, 0));
  const paidToward = cashPaid + Math.max(roundMoney(discountAmount), extraAlloc);
  const settledOnStoredNet = footerDisc > 0.5 && paidToward + 1 >= storedNet;
  const rounded = settledOnStoredNet
    ? { billAmount: face, paidAmount: face, pendingAmount: 0 }
    : applyBillRoundOff(face, paidToward);
  const billAmount = footerDisc > 0.5 && lineDisc <= 0.5 ? face : rounded.billAmount;
  const settledByEmpire = empireMarkedSettled(order);
  const paidAmount = settledByEmpire ? billAmount : rounded.paidAmount;
  const pendingAmount = settledByEmpire ? 0 : rounded.pendingAmount;
  const billDiscount = 0;
  const billDate = order.orderDate || order.createdAt;
  const displayNumber = order.typeBillNumber != null
    ? String(order.typeBillNumber)
    : String(order.invoiceNumber || order.orderNumber || order.id.slice(-6));
  const days = daysSince(billDate, asOfValue);
  const bucket = agingBucket(days);

  return applyInterestFields({
    billId: order.id,
    billType: 'order',
    billNumber: displayNumber,
    transactionType: order.transactionType || null,
    voucherNumber: order.orderNumber || String(order.invoiceNumber || '-'),
    billDate,
    days,
    agingBucket: bucket,
    grace: order.grace,
    adatDisc: billDiscount,
    billAmount,
    paidAmount,
    pendingAmount,
    taxableAmount: orderTaxableAmount(order),
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
  }, order.customer || {});
}
