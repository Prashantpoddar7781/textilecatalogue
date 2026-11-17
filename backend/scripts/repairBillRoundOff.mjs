/**
 * Bank receipts entered after the Empire backup can be short of their bills by
 * a few paise (0.10, 0.40) because the bill was not rounded to a rupee.
 * This brings that allocation to the receipt. Sale, purchase, and note posting
 * already round on read; this only rewrites the receipt rows that do not tally.
 *
 *   node backend/scripts/repairBillRoundOff.mjs
 *   node backend/scripts/repairBillRoundOff.mjs --apply
 *
 * Safe to run again. Skips Empire rows tagged [E:]. Does not touch journals.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { isDeductAllocation } from '../constants/bankCashSeries.js';
import { roundMoney } from '../utils/orderBilling.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const AFTER = new Date('2026-11-08T14:30:00.000Z');

function tagged(remarks) {
  return /\[E:/i.test(String(remarks || ''));
}

function netOf(allocations) {
  let add = 0;
  let deduct = 0;
  for (const row of allocations) {
    const amount = Number(row?.adjustAmount) || 0;
    if (isDeductAllocation(row)) deduct += amount;
    else add += amount;
  }
  return { net: roundMoney(add - deduct), add: roundMoney(add), deduct: roundMoney(deduct) };
}

function snapToAmount(allocations, gap) {
  const next = allocations.map(row => ({ ...row }));
  let left = gap;
  const adds = next
    .map((row, index) => ({ row, index }))
    .filter(item => !isDeductAllocation(item.row) && (Number(item.row.adjustAmount) || 0) > 0)
    .sort((a, b) => (Number(b.row.adjustAmount) || 0) - (Number(a.row.adjustAmount) || 0));
  for (const item of adds) {
    if (Math.abs(left) < 0.001) break;
    const current = Number(item.row.adjustAmount) || 0;
    const updated = roundMoney(current - left);
    if (updated < -0.001) continue;
    item.row.adjustAmount = Math.max(0, updated);
    left = 0;
  }
  return { rows: next, leftover: roundMoney(left) };
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'poonamcreation1012@gmail.com' },
    select: { id: true }
  });
  if (!user) throw new Error('Poonam company was not found');

  const entries = await prisma.bankEntry.findMany({
    where: { userId: user.id, entryDate: { gte: AFTER } },
    orderBy: [{ entryDate: 'asc' }, { voucherNumber: 'asc' }]
  });

  const fixes = [];
  for (const entry of entries) {
    if (tagged(entry.remarks)) continue;
    const allocations = Array.isArray(entry.billAllocations) ? entry.billAllocations : [];
    if (!allocations.length) continue;
    const { net } = netOf(allocations);
    if (String(entry.entryType || '').toLowerCase() !== 'receipt') continue;
    const amount = roundMoney(entry.amount);
    const gap = roundMoney(net - amount);
    // A receipt that already matches its bills stays. Only a gap under one rupee,
    // the round-off, is brought onto the amount the user entered.
    if (Math.abs(gap) < 0.005 || Math.abs(gap) >= 1) continue;
    const snapped = snapToAmount(allocations, gap);
    if (Math.abs(snapped.leftover) >= 0.005) continue;
    const nextAmount = amount;
    const nextRows = snapped.rows;
    const reason = `gap ${gap}`;
    const check = netOf(nextRows);
    if (Math.abs(check.net - nextAmount) >= 0.005) continue;
    fixes.push({
      id: entry.id,
      voucher: entry.voucherNumber,
      type: entry.transactionType || entry.entryType,
      party: entry.partyName,
      amount,
      net,
      nextAmount,
      reason,
      rows: nextRows
    });
  }

  console.log(`Receipts to correct: ${fixes.length}`);
  for (const row of fixes.slice(0, 40)) {
    console.log(
      `${row.type} ${row.voucher} ${row.party} amount ${row.amount} bills ${row.net} -> ${row.nextAmount} (${row.reason})`
    );
  }
  if (fixes.length > 40) console.log(`... and ${fixes.length - 40} more`);

  if (!apply) {
    console.log('Dry run. Pass --apply to write these receipts.');
    return;
  }

  for (const row of fixes) {
    const check = netOf(row.rows);
    await prisma.bankEntry.update({
      where: { id: row.id },
      data: {
        amount: row.nextAmount,
        netBillAmount: check.net,
        billAllocations: row.rows
      }
    });
  }
  console.log(`Updated ${fixes.length} receipts.`);
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
