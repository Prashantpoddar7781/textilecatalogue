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
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { PrismaClient } from '@prisma/client';
import { getStateCodeFromName, getStateFromGstin } from '../utils/gstCalculation.js';
import { allocateWorkReceipts, attachCategories, attachEmpirePicks, impliedDiscountPercent } from '../utils/workDespatchAllocation.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

function loadPickMap() {
  const file = process.env.EMPIRE_PICKS
    || path.join(os.tmpdir(), 'poonam-empire-08nov', 'billdet-picks.tsv');
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line.length);
  if (lines.length < 2) return null;
  const headers = lines[0].split('\t');
  const map = new Map();
  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    const row = {};
    headers.forEach((header, index) => { row[header] = cols[index] ?? ''; });
    const key = `${String(row.TYPE || '').trim().toUpperCase()}|${Number(row.VNO) || 0}`;
    if (!key.endsWith('|0')) {
      const list = map.get(key) || [];
      list.push({
        srNo: Number(row.SRNO) || 0,
        qual: row.qual || '',
        pcs: Number(row.PCS) || 0,
        ordBill: row.ORDBILL || '',
        ordType: row.ORDTYPE || '',
        ordVno: Number(row.orderno) || 0
      });
      map.set(key, list);
    }
  }
  return map;
}

function loadBilldetMap(pickFile) {
  const file = process.env.EMPIRE_BILLDET
    || path.join(path.dirname(pickFile), 'billdet.tsv');
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line.length);
  if (lines.length < 2) return null;
  const headers = lines[0].split('\t');
  const map = new Map();
  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    const row = {};
    headers.forEach((header, index) => { row[header] = cols[index] ?? ''; });
    const key = `${String(row.TYPE || '').trim().toUpperCase()}|${Number(row.VNO) || 0}`;
    if (key.endsWith('|0')) continue;
    const list = map.get(key) || [];
    list.push({
      srNo: Number(row.SRNO) || 0,
      qual: row.qual || '',
      pcs: Number(row.PCS) || 0,
      category: row.CATEGORY || ''
    });
    map.set(key, list);
  }
  return map;
}

function stampCategories(docs, billdetMap) {
  if (!billdetMap) return docs;
  return docs.map(doc => {
    const tag = String(doc.remarks || '').match(/\[E:([^:\]]+):(\d+)\]/);
    if (!tag) return doc;
    const empire = billdetMap.get(`${tag[1].toUpperCase()}|${Number(tag[2])}`);
    if (!empire || !empire.length) return doc;
    return { ...doc, lineItems: attachCategories(doc.lineItems, empire) };
  });
}

function stampPicks(receipts, pickMap) {
  if (!pickMap) return receipts;
  return receipts.map(receipt => {
    const tag = String(receipt.remarks || '').match(/\[E:([^:\]]+):(\d+)\]/);
    if (!tag) return receipt;
    const empire = pickMap.get(`${tag[1].toUpperCase()}|${Number(tag[2])}`);
    if (!empire || !empire.length) return receipt;
    return { ...receipt, lineItems: attachEmpirePicks(receipt.lineItems, empire) };
  });
}

export async function repairWorkDespatchLinks(prisma, userId) {
  const [despatchRows, receiptRows] = await Promise.all([
    prisma.workDespatch.findMany({ where: { userId, status: { not: 'cancelled' } } }),
    prisma.workReceipt.findMany({ where: { userId, status: { not: 'cancelled' } } })
  ]);
  const pickFile = process.env.EMPIRE_PICKS
    || path.join(os.tmpdir(), 'poonam-empire-08nov', 'billdet-picks.tsv');
  const billdetMap = loadBilldetMap(pickFile);
  const despatches = stampCategories(despatchRows, billdetMap);
  let categories = 0;
  for (let index = 0; index < despatches.length; index += 1) {
    const before = JSON.stringify(despatchRows[index].lineItems || []);
    const after = JSON.stringify(despatches[index].lineItems || []);
    if (before === after) continue;
    categories += 1;
    await prisma.workDespatch.update({
      where: { id: despatches[index].id },
      data: { lineItems: despatches[index].lineItems }
    });
  }
  const updates = allocateWorkReceipts({
    despatches,
    receipts: stampCategories(stampPicks(receiptRows, loadPickMap()), billdetMap)
  });
  const linkedIds = new Set(updates.filter(update => update.workDespatchId).map(update => update.id));
  let discounts = 0;
  for (const receipt of receiptRows) {
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
  return {
    linked: linkedIds.size,
    discounts,
    categories,
    despatches: despatches.length,
    receipts: receiptRows.length
  };
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
    console.log(`Work despatch links: ${work.linked} receipts linked out of ${work.receipts}, ${work.discounts} discounts filled, ${work.categories} challans labelled, ${work.despatches} challans`);
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
