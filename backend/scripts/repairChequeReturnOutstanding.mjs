/**
 * A bounced receipt no longer pays its bills. Empire paid=Y must not keep
 * that bill off outstanding when no live receipt still covers it.
 *
 *   node backend/scripts/repairChequeReturnOutstanding.mjs
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { isChequeReturnedEntry } from '../constants/bankCashSeries.js';
import { releaseBouncedBillOutstanding } from '../utils/orderBilling.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });
const prisma = new PrismaClient();

const entries = await prisma.bankEntry.findMany({
  where: { remarks: { contains: 'CHEQUE RETN' } },
  select: { userId: true, remarks: true, billAllocations: true }
});
const byUser = new Map();
for (const entry of entries) {
  if (!isChequeReturnedEntry(entry) || !Array.isArray(entry.billAllocations)) continue;
  const list = byUser.get(entry.userId) || [];
  list.push(...entry.billAllocations);
  byUser.set(entry.userId, list);
}
const released = [];
for (const [userId, allocations] of byUser) {
  const rows = await releaseBouncedBillOutstanding(prisma, userId, allocations);
  released.push(...rows);
}
console.log(JSON.stringify({ users: byUser.size, released }, null, 2));
await prisma.$disconnect();
