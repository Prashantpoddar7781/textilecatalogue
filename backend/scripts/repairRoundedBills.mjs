/**
 * Nearest-rupee invoice on every bill except journals. Taxable stays in paise.
 * TDS on mill and work receipt stays on the next rupee. Net is the rounded
 * invoice minus that TDS. A value already in rupees is left as it is.
 *
 *   node backend/scripts/repairRoundedBills.mjs
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { roundMoney, roundRupee, roundTdsRupee } from '../utils/orderBilling.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });
const prisma = new PrismaClient();

function drifted(stored, next) {
  return Math.abs((Number(stored) || 0) - next) >= 0.005;
}

async function roundInvoices(model, label) {
  const rows = await prisma[model].findMany({
    select: { id: true, invoiceValue: true, tdsAmount: true, netAfterTds: true }
  });
  let updated = 0;
  for (const row of rows) {
    const invoiceValue = roundRupee(row.invoiceValue);
    const tdsAmount = roundTdsRupee(row.tdsAmount);
    const netAfterTds = roundMoney(invoiceValue - tdsAmount);
    if (!drifted(row.invoiceValue, invoiceValue) && !drifted(row.tdsAmount, tdsAmount) && !drifted(row.netAfterTds, netAfterTds)) continue;
    await prisma[model].update({
      where: { id: row.id },
      data: { invoiceValue, tdsAmount, netAfterTds }
    });
    updated += 1;
  }
  return { label, rows: rows.length, updated };
}

async function roundNet(model, label) {
  const rows = await prisma[model].findMany({ select: { id: true, netAmount: true } });
  let updated = 0;
  for (const row of rows) {
    const netAmount = roundRupee(row.netAmount);
    if (!drifted(row.netAmount, netAmount)) continue;
    await prisma[model].update({ where: { id: row.id }, data: { netAmount } });
    updated += 1;
  }
  return { label, rows: rows.length, updated };
}

async function roundNotes() {
  const rows = await prisma.creditDebitNote.findMany({
    select: { id: true, netAmount: true, netAmountAfterTds: true }
  });
  let updated = 0;
  for (const row of rows) {
    const netAmount = roundRupee(row.netAmount);
    const netAmountAfterTds = roundRupee(row.netAmountAfterTds);
    if (!drifted(row.netAmount, netAmount) && !drifted(row.netAmountAfterTds, netAmountAfterTds)) continue;
    await prisma.creditDebitNote.update({
      where: { id: row.id },
      data: { netAmount, netAmountAfterTds }
    });
    updated += 1;
  }
  return { label: 'creditDebitNote', rows: rows.length, updated };
}

async function roundPurchaseBills() {
  const rows = await prisma.purchaseBill.findMany({ select: { id: true, grandTotal: true } });
  let updated = 0;
  for (const row of rows) {
    const grandTotal = roundRupee(row.grandTotal);
    if (!drifted(row.grandTotal, grandTotal)) continue;
    await prisma.purchaseBill.update({ where: { id: row.id }, data: { grandTotal } });
    updated += 1;
  }
  return { label: 'purchaseBill', rows: rows.length, updated };
}

const report = [];
report.push(await roundInvoices('workReceipt', 'workReceipt'));
report.push(await roundInvoices('millReceipt', 'millReceipt'));
report.push(await roundNet('greyPurchase', 'greyPurchase'));
report.push(await roundNet('greyPurchaseReturn', 'greyPurchaseReturn'));
report.push(await roundNotes());
report.push(await roundPurchaseBills());
console.log(JSON.stringify(report));
await prisma.$disconnect();
