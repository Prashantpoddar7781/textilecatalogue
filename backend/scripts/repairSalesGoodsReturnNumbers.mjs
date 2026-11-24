/**
 * SALES GOODS RETURN (P3) prior-year vouchers were stored as the printed number.
 * [E:P3:100112] is last year's 112, so this year's next voucher was also 112.
 * The raw VNO stays on the voucher. 100112 prints as 112*. Lines are not touched.
 *
 *   node backend/scripts/repairSalesGoodsReturnNumbers.mjs
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { getCurrentAccountingYear, parseAccountingYear } from '../utils/accountingYear.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });
const prisma = new PrismaClient();

const rows = await prisma.order.findMany({
  where: { transactionType: 'SALES GOODS RETURN', remarks: { contains: '[E:P3:' } },
  select: { id: true, typeBillNumber: true, remarks: true, buyerName: true, orderDate: true }
});

const year = parseAccountingYear(getCurrentAccountingYear());
let updated = 0;
for (const row of rows) {
  const match = String(row.remarks || '').match(/\[E:P3:(\d+)\]/);
  const raw = match ? Number(match[1]) : 0;
  if (!raw || raw < 100000 || raw === row.typeBillNumber) continue;
  // A return already dated in this year stays on its printed number.
  // Geeta's SITADEVI voucher 112 is 24 Nov 2026, even though the remark still says 100112.
  if (year && row.orderDate && row.orderDate >= year.startDate && row.orderDate <= year.endDate) continue;
  await prisma.order.update({ where: { id: row.id }, data: { typeBillNumber: raw } });
  updated += 1;
}

const geeta = await prisma.order.findFirst({
  where: { transactionType: 'SALES GOODS RETURN', remarks: { contains: '[E:P3:100112]' } },
  select: { typeBillNumber: true, buyerName: true, orderDate: true, orderLines: true }
});
const line = Array.isArray(geeta?.orderLines) ? geeta.orderLines[0] : null;
console.log(JSON.stringify({
  scanned: rows.length,
  updated,
  geeta: geeta && {
    stored: geeta.typeBillNumber,
    party: geeta.buyerName,
    date: geeta.orderDate,
    item: line?.itemName || line?.description || null,
    pcs: line?.pcs ?? line?.quantity ?? null,
    amount: line?.amount ?? null
  }
}, null, 2));
await prisma.$disconnect();
