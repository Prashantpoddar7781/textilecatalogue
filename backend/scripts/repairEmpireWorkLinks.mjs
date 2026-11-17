/**
 * Fills the work-despatch link the Empire backup does not store, and replaces a
 * city stored in the state field with the state from the GSTIN.
 *
 *   node backend/scripts/repairEmpireWorkLinks.mjs
 *
 * Safe to run again. Only the company passed in (or Poonam, when run directly)
 * is touched. Does not wipe vouchers.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { PrismaClient } from '@prisma/client';
import { getSourceSeriesFor } from '../constants/erpTransactionPostingRules.js';
import { getStateCodeFromName, getStateFromGstin } from '../utils/gstCalculation.js';
import { allocateWorkReceipts, impliedDiscountPercent } from '../utils/workDespatchAllocation.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export async function repairWorkDespatchLinks(prisma, userId) {
  const [despatches, receipts] = await Promise.all([
    prisma.workDespatch.findMany({ where: { userId, status: { not: 'cancelled' } } }),
    prisma.workReceipt.findMany({ where: { userId, status: { not: 'cancelled' } } })
  ]);
  const updates = allocateWorkReceipts({
    despatches,
    receipts,
    sourceSeriesFor: getSourceSeriesFor
  });
  const linkedIds = new Set(updates.map(update => update.id));
  let discounts = 0;
  for (const receipt of receipts) {
    const update = updates.find(row => row.id === receipt.id);
    const pct = String(receipt.remarks || '').includes('[E:') ? impliedDiscountPercent(receipt) : 0;
    if (!update && !(pct > 0)) continue;
    const data = {};
    if (update) {
      data.workDespatchId = update.workDespatchId;
      data.sourceDespatchIds = update.sourceDespatchIds;
      data.lineItems = update.lineItems;
    }
    if (pct > 0) {
      const gross = Number(receipt.grossAmount) || 0;
      data.discountPercent = pct;
      data.discountAmount = round2(gross * pct / 100);
      data.taxableAmount = round2(gross - data.discountAmount);
      discounts += 1;
    }
    await prisma.workReceipt.update({ where: { id: receipt.id }, data });
  }
  return { linked: linkedIds.size, discounts, despatches: despatches.length, receipts: receipts.length };
}

export async function repairPartyStatesFromGstin(prisma, userId) {
  let customers = 0;
  let suppliers = 0;
  const customerRows = await prisma.customer.findMany({
    where: { userId },
    select: { id: true, state: true, gstNumber: true }
  });
  for (const row of customerRows) {
    const next = stateFromGstin(row.state, row.gstNumber);
    if (!next || next === row.state) continue;
    await prisma.customer.update({ where: { id: row.id }, data: { state: next } });
    customers += 1;
  }
  const supplierRows = await prisma.supplier.findMany({
    where: { userId },
    select: { id: true, state: true, gstNumber: true }
  });
  for (const row of supplierRows) {
    const next = stateFromGstin(row.state, row.gstNumber);
    if (!next || next === row.state) continue;
    await prisma.supplier.update({ where: { id: row.id }, data: { state: next } });
    suppliers += 1;
  }
  return { customers, suppliers };
}

function stateFromGstin(state, gstin) {
  if (getStateCodeFromName(state)) return '';
  return getStateFromGstin(gstin).stateName || '';
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const email = process.env.REPAIR_EMAIL || 'poonamcreation1012@gmail.com';
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      console.log('No company found for that login.');
      return;
    }
    const states = await repairPartyStatesFromGstin(prisma, user.id);
    const work = await repairWorkDespatchLinks(prisma, user.id);
    console.log(`Party state from GSTIN: ${states.customers} customers, ${states.suppliers} suppliers`);
    console.log(`Work despatch links: ${work.linked} receipts linked out of ${work.receipts}, ${work.discounts} discounts filled, ${work.despatches} challans`);
  } finally {
    await prisma.$disconnect();
  }
}

const calledDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (calledDirectly) {
  main().catch(error => {
    console.error(error.message || error);
    process.exit(1);
  });
}
