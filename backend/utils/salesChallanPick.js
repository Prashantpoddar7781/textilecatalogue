/**
 * FINISH SALES (GST) previous link is SALES CHALLAN (O57).
 * The challan is an Order with status posted. Its voucher is typeBillNumber.
 * A later GST bill consumes it when the bill's order number is that voucher,
 * or when the bill itself is that voucher in the same year and names no other order.
 */
import { getPreviousLink, getTargetSeriesFor } from '../constants/erpTransactionPostingRules.js';

export const SALES_CHALLAN_SERIES = 'SALES CHALLAN';

const customerPick = { select: { gstNumber: true, state: true, agentName: true } };

export function picksSalesChallan(transactionType) {
  return getPreviousLink(transactionType) === SALES_CHALLAN_SERIES;
}

export function challanVoucherNo(order) {
  const number = Number(order?.typeBillNumber);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function orderNumberTokens(value) {
  return String(value || '')
    .split(/[^0-9]+/)
    .map(part => Number(part))
    .filter(number => Number.isFinite(number) && number > 0);
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function lineList(value) {
  return Array.isArray(value) ? value : [];
}

function yearOf(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getUTCFullYear();
}

/** True when this completed bill already took the challan. */
export function billConsumesChallan(bill, challan) {
  const number = challanVoucherNo(challan);
  if (!number) return false;
  const tokens = orderNumberTokens(bill?.orderNumber);
  if (tokens.length) return tokens.includes(number);
  if (Number(bill?.typeBillNumber) !== number) return false;
  const billYear = yearOf(bill?.orderDate || bill?.createdAt);
  const challanYear = yearOf(challan?.orderDate || challan?.createdAt);
  return billYear != null && billYear === challanYear;
}

export async function loadConsumingBills(client, userId, challans, excludeBillId = null) {
  const targets = getTargetSeriesFor(SALES_CHALLAN_SERIES);
  const numbers = Array.from(new Set(challans.map(challanVoucherNo).filter(Boolean)));
  if (!targets.length || !numbers.length) return [];
  const or = [];
  for (const number of numbers) {
    const text = String(number);
    or.push({ typeBillNumber: number });
    or.push({ orderNumber: text });
    or.push({ orderNumber: { startsWith: `${text},` } });
    or.push({ orderNumber: { startsWith: `${text} ` } });
    or.push({ orderNumber: { contains: `, ${text}` } });
    or.push({ orderNumber: { contains: `,${text}` } });
  }
  return client.order.findMany({
    where: {
      userId,
      status: 'completed',
      transactionType: { in: targets },
      ...(excludeBillId ? { id: { not: excludeBillId } } : {}),
      OR: or
    },
    select: {
      id: true,
      typeBillNumber: true,
      orderNumber: true,
      orderDate: true,
      createdAt: true,
      orderLines: true
    }
  });
}

function soldAgainstChallan(challan, bills) {
  const byLine = new Map();
  let closedWhole = false;
  for (const bill of bills) {
    if (!billConsumesChallan(bill, challan)) continue;
    const linked = lineList(bill.orderLines).filter(line => line?.sourceChallanId === challan.id);
    if (!linked.length) {
      closedWhole = true;
      continue;
    }
    for (const line of linked) {
      const key = Number(line.sourceLineNo || line.lineNo) || 0;
      const current = byLine.get(key) || { pcs: 0, mtsQty: 0 };
      current.pcs = roundMoney(current.pcs + (Number(line.pcs ?? line.quantity) || 0));
      current.mtsQty = roundMoney(current.mtsQty + (Number(line.mtsQty) || 0));
      byLine.set(key, current);
    }
  }
  return { byLine, closedWhole };
}

export function toChallanPickEntry(challan, bills) {
  const { byLine, closedWhole } = soldAgainstChallan(challan, bills);
  const pendingLines = lineList(challan.orderLines).map((line, index) => {
    const lineNo = Number(line.lineNo) || index + 1;
    const pcs = Number(line.pcs ?? line.quantity) || 0;
    const mtsQty = Number(line.mtsQty) || 0;
    const used = closedWhole
      ? { pcs, mtsQty }
      : (byLine.get(lineNo) || { pcs: 0, mtsQty: 0 });
    return {
      ...line,
      lineNo,
      sourceLineNo: lineNo,
      pendingPcs: roundMoney(Math.max(0, pcs - used.pcs)),
      pendingMts: roundMoney(Math.max(0, mtsQty - used.mtsQty))
    };
  });
  const pendingPcs = roundMoney(pendingLines.reduce((sum, line) => sum + line.pendingPcs, 0));
  const pendingMts = roundMoney(pendingLines.reduce((sum, line) => sum + line.pendingMts, 0));
  const hsnCode = pendingLines.map(line => String(line.hsnCode || '').trim()).find(Boolean) || null;
  return {
    id: challan.id,
    customerId: challan.customerId || null,
    partyName: challan.buyerName,
    partyGstin: challan.customer?.gstNumber || null,
    state: challan.customer?.state || null,
    station: challan.station || null,
    brokerName: challan.agentName || challan.customer?.agentName || null,
    transportName: challan.transportName || null,
    vehicleNo: challan.vehicleNo || null,
    haste: challan.haste || null,
    hasteGstin: challan.hasteGstin || null,
    dhara: challan.dhara ?? 0,
    grace: challan.grace ?? 0,
    screenSeries: challan.screenSeries || null,
    orderNo: challanVoucherNo(challan),
    orderDate: challan.orderDate,
    remarks: challan.remarks || null,
    hsnCode,
    lineItems: lineList(challan.orderLines),
    pendingLines,
    pendingPcs,
    pendingMts,
    status: pendingPcs <= 0.001 && pendingMts <= 0.001 ? 'closed' : 'open',
    sourceKind: 'sales_challan'
  };
}

async function withPending(client, userId, challans, excludeBillId) {
  if (!challans.length) return [];
  const bills = await loadConsumingBills(client, userId, challans, excludeBillId);
  return challans.map(challan => toChallanPickEntry(challan, bills));
}

export async function findSalesChallansByNumber(client, userId, raw, excludeBillId = null) {
  const text = String(raw || '').trim();
  if (!text) return [];
  const digits = text.replace(/[^\d]/g, '');
  const asNumber = Number(digits);
  const or = [{ challanNo: { equals: text, mode: 'insensitive' } }];
  if (Number.isFinite(asNumber) && asNumber > 0 && String(asNumber) === digits) {
    or.push({ typeBillNumber: asNumber });
  }
  const challans = await client.order.findMany({
    where: {
      userId,
      transactionType: SALES_CHALLAN_SERIES,
      status: 'posted',
      OR: or
    },
    include: { customer: customerPick },
    orderBy: [{ orderDate: 'desc' }, { typeBillNumber: 'desc' }],
    take: 20
  });
  return withPending(client, userId, challans, excludeBillId);
}

export async function listPendingSalesChallans(client, userId, { partyName, customerId, excludeBillId } = {}) {
  const name = String(partyName || '').trim();
  const partyFilter = name
    ? { buyerName: { equals: name, mode: 'insensitive' } }
    : customerId
      ? { customerId }
      : null;
  if (!partyFilter) return [];
  const challans = await client.order.findMany({
    where: {
      userId,
      transactionType: SALES_CHALLAN_SERIES,
      status: 'posted',
      ...partyFilter
    },
    include: { customer: customerPick },
    orderBy: [{ orderDate: 'desc' }, { typeBillNumber: 'desc' }]
  });
  const entries = await withPending(client, userId, challans, excludeBillId);
  return entries.filter(row => row.pendingPcs > 0.001 || row.pendingMts > 0.001);
}
