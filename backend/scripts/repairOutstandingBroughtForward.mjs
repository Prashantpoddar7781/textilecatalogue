/**
 * SHREE VASTRALAYA & CO. finish-sale bills from before 1 Apr 2026 were
 * received at 98 percent in the previous year. That receipt is already inside
 * the opening balance, so this year has no bank line for it. Empire still
 * shows the remaining 2 percent (1742/F is 639, 1865/F is 682). Stamp that
 * brought-forward receipt on the bill. Do not post it again, and do not touch
 * a bill that already has a receipt or a bill raised this year.
 *
 *   node backend/scripts/repairOutstandingBroughtForward.mjs
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { mapOrderToPendingBill } from '../utils/orderBilling.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });
const prisma = new PrismaClient();

const EMAIL = 'poonamcreation1012@gmail.com';
const PARTY = 'SHREE VASTRALAYA & CO.';
const BOOKS_FROM = new Date('2026-04-01T00:00:00.000Z');

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

const user = await prisma.user.findFirst({ where: { email: EMAIL }, select: { id: true } });
if (!user) throw new Error('Poonam user was not found');

const [orders, receipts] = await Promise.all([
  prisma.order.findMany({
    where: {
      userId: user.id,
      buyerName: { equals: PARTY, mode: 'insensitive' },
      transactionType: { contains: 'FINISH SALES', mode: 'insensitive' },
      orderDate: { lt: BOOKS_FROM }
    }
  }),
  prisma.bankEntry.findMany({
    where: { userId: user.id, entryType: 'receipt' },
    select: { billAllocations: true }
  })
]);

const paidIds = new Set();
for (const receipt of receipts) {
  const rows = Array.isArray(receipt.billAllocations) ? receipt.billAllocations : [];
  for (const row of rows) {
    if (row?.billId) paidIds.add(row.billId);
  }
}

let stamped = 0;
let skippedPaid = 0;
const checks = [];
for (const order of orders) {
  if (paidIds.has(order.id)) {
    skippedPaid += 1;
    continue;
  }
  const open = mapOrderToPendingBill(order, new Map());
  const bill = roundMoney(open.billAmount);
  if (!(bill > 1)) continue;
  const pending = Math.round(bill * 0.02);
  const brought = roundMoney(bill - pending);
  if (!(brought > 0) || !(pending > 0)) continue;
  const raw = order.einvoiceRaw && typeof order.einvoiceRaw === 'object' && !Array.isArray(order.einvoiceRaw)
    ? order.einvoiceRaw
    : {};
  if (roundMoney(raw.empireBroughtForwardPaid) === brought) continue;
  const einvoiceRaw = { ...raw, empireBroughtForwardPaid: brought };
  await prisma.order.update({ where: { id: order.id }, data: { einvoiceRaw } });
  stamped += 1;
  const after = mapOrderToPendingBill({ ...order, einvoiceRaw }, new Map());
  if ([1742, 1865, 712, 698].includes(order.typeBillNumber)) {
    checks.push(`${order.typeBillNumber} bill ${after.billAmount} paid ${after.paidAmount} pend ${after.pendingAmount}`);
  }
}

console.log(`stamped ${stamped}, already received this year ${skippedPaid}`);
for (const line of checks) console.log(line);
await prisma.$disconnect();
