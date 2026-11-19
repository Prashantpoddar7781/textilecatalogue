/**
 * Empire BILLS.paid = Y is off outstanding, even when this year's receipts
 * do not name the bill. Stamps those sale bills and leaves paid = N pending.
 *
 *   node backend/scripts/repairEmpireSettledBills.mjs
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PrismaClient } from '@prisma/client';

dotenv.config();
const prisma = new PrismaClient();
const exportDir = process.env.EMPIRE_EXPORT_DIR || path.join(os.tmpdir(), 'poonam-empire-08nov');
const TAG = /\[E:([^:\]]+):(\d+)\]/;

function readTsv(name) {
  const file = path.join(exportDir, `${name}.tsv`);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line.length);
  const headers = lines[0].split('\t');
  return lines.slice(1).map(line => {
    const cols = line.split('\t');
    const row = {};
    headers.forEach((header, index) => { row[header] = cols[index] ?? ''; });
    return row;
  });
}

const paidKeys = new Set();
for (const bill of readTsv('bills')) {
  if (String(bill.paid || '').trim().toUpperCase() !== 'Y') continue;
  paidKeys.add(`${String(bill.TYPE || '').trim()}:${Number(bill.VNO) || 0}`);
}

const orders = await prisma.order.findMany({
  where: { remarks: { contains: '[E:' } },
  select: { id: true, remarks: true, einvoiceRaw: true }
});

let stamped = 0;
let already = 0;
for (const order of orders) {
  const match = String(order.remarks || '').match(TAG);
  if (!match || !paidKeys.has(`${match[1]}:${Number(match[2])}`)) continue;
  const raw = order.einvoiceRaw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.empirePaid === true) {
    already += 1;
    continue;
  }
  const next = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? { ...raw, empirePaid: true }
    : { empirePaid: true };
  await prisma.order.update({ where: { id: order.id }, data: { einvoiceRaw: next } });
  stamped += 1;
}

console.log(JSON.stringify({ paidInBackup: paidKeys.size, taggedOrders: orders.length, stamped, already }));
await prisma.$disconnect();
