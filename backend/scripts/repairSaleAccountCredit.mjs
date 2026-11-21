/**
 * SALES A/C credits Empire BILLAMT. The party ledger stays on the gross invoice.
 * Reads the sales-bill export (TYPE, VNO, BILLAMT). An [E:S51:n] tag wins over
 * the printed bill number, so a prior-year copy is not given this year's bill.
 *
 *   node backend/scripts/repairSaleAccountCredit.mjs
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { saleAccountCredit } from '../utils/orderBilling.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

const candidates = [
  process.env.EMPIRE_SALES_TSV,
  path.join(os.tmpdir(), 'poonam-sales-bills.tsv'),
  path.join(os.tmpdir(), 'poonam-empire', 'bills.tsv')
].filter(Boolean);

const tsvPath = candidates.find(file => fs.existsSync(file));
if (!tsvPath) throw new Error('Sales bill export not found. Export BILLS first.');

const num = (value) => Number(String(value || '').replace(/,/g, '')) || 0;
const text = fs.readFileSync(tsvPath, 'utf8');
const [header, ...lines] = text.split(/\r?\n/).filter(Boolean);
const cols = header.split('\t');
const bills = new Map();
for (const line of lines) {
  const cells = line.split('\t');
  const row = Object.fromEntries(cols.map((name, index) => [name, cells[index] || '']));
  const series = String(row.TYPE || '').trim().toUpperCase();
  if (series !== 'S1' && series !== 'S51') continue;
  const billAmt = Math.round(num(row.BILLAMT));
  if (!(billAmt > 0)) continue;
  bills.set(`${series}|${Number(row.VNO)}`, billAmt);
}

function voucherKey(order) {
  const tag = String(order.remarks || '').match(/\[E:(S51|S1):(\d+)\]/i);
  if (tag) return `${tag[1].toUpperCase()}|${Number(tag[2])}`;
  const series = order.transactionType === 'FINISH SALES' ? 'S1' : 'S51';
  return `${series}|${Number(order.typeBillNumber)}`;
}

const prisma = new PrismaClient();
const user = await prisma.user.findUnique({
  where: { email: 'poonamcreation1012@gmail.com' },
  select: { id: true }
});
if (!user) throw new Error('Poonam company was not found.');

const orders = await prisma.order.findMany({
  where: {
    userId: user.id,
    status: 'completed',
    transactionType: { in: ['FINISH SALES', 'FINISH SALES (GST)'] }
  },
  select: { id: true, transactionType: true, typeBillNumber: true, remarks: true, einvoiceRaw: true, orderLines: true }
});

const grouped = new Map();
for (const order of orders) {
  const key = voucherKey(order);
  const list = grouped.get(key) || [];
  list.push(order);
  grouped.set(key, list);
}

let stamped = 0;
let already = 0;
let skipped = 0;
const clashes = [];
for (const [key, list] of grouped) {
  const billAmt = bills.get(key);
  if (!(billAmt > 0)) continue;
  if (list.length > 1) {
    clashes.push(`${key} x${list.length}`);
    skipped += list.length;
    continue;
  }
  const order = list[0];
  const current = saleAccountCredit(order);
  if (Math.abs(current - billAmt) <= 0.5) {
    already += 1;
    continue;
  }
  const raw = order.einvoiceRaw && typeof order.einvoiceRaw === 'object' && !Array.isArray(order.einvoiceRaw)
    ? { ...order.einvoiceRaw }
    : {};
  raw.saleCredit = billAmt;
  await prisma.order.update({ where: { id: order.id }, data: { einvoiceRaw: raw } });
  stamped += 1;
}

console.log(JSON.stringify({ tsv: tsvPath, bills: bills.size, orders: orders.length, stamped, already, skipped, clashes }, null, 2));
await prisma.$disconnect();
