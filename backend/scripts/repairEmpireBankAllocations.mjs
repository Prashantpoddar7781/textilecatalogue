/**
 * Rewrites Empire bank/cash bill picks into the shape the voucher screen reads.
 * Safe to run again. Only rows that still carry the Empire bill link are touched.
 *
 *   node backend/scripts/repairEmpireBankAllocations.mjs
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { getAdjustDirection } from '../constants/creditDebitNoteTypes.js';
import { isPurchaseReturn, isSalesGoodsReturn } from '../utils/orderBilling.js';
import { nextNumberFromVoucherList } from '../constants/bankCashSeries.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SERIES_TSV = path.join(here, '..', 'constants', 'data', 'transactionTypes.tsv');
const TAG = /^\[E:([^:\]]+):(\d+)\]/;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

function cleanBillLabel(billText, code) {
  const raw = String(billText || '').replace(/\*/g, '').trim();
  if (!raw) return '';
  if (String(code || '').toUpperCase() === 'XX' || /^\d+\s*B$/i.test(raw)) {
    const match = raw.match(/^(\d+)/);
    return match ? `${Number(match[1])} B` : raw;
  }
  return raw;
}

function asIso(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return new Date(`${raw.slice(0, 10)}T12:00:00+05:30`).toISOString();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function loadSeriesNames() {
  const names = new Map();
  if (!fs.existsSync(SERIES_TSV)) return names;
  const lines = fs.readFileSync(SERIES_TSV, 'utf8').split(/\r?\n/).filter(Boolean);
  for (const line of lines.slice(1)) {
    const [name, code] = line.split('\t');
    if (name && code) names.set(code.trim(), name.trim());
  }
  return names;
}

function indexBills(bills) {
  const map = new Map();
  for (const bill of bills || []) {
    const code = String(bill.TYPE || '').trim();
    const vno = Number(bill.VNO);
    if (!code || !Number.isFinite(vno)) continue;
    const key = `${code}|${vno}`;
    if (!map.has(key)) map.set(key, bill);
  }
  return map;
}

function readTsv(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line.length);
  if (!lines.length) return [];
  const headers = lines[0].split('\t');
  return lines.slice(1).map(line => {
    const cols = line.split('\t');
    const row = {};
    headers.forEach((header, index) => { row[header] = cols[index] ?? ''; });
    return row;
  });
}

function empireRows(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const rows = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const fromEmpire = item.empireBillNo || (item.billNo && !item.billId);
    if (!fromEmpire) continue;
    const signed = item.empireAmount != null ? Number(item.empireAmount) : Number(item.amount);
    rows.push({
      billType: String(item.empireBillType || item.billType || '').trim(),
      billNo: String(item.empireBillNo || item.billNo || '').trim(),
      amount: Number.isFinite(signed) ? signed : 0
    });
  }
  return rows.length ? rows : null;
}

function pickDoc(list, code) {
  const docs = list || [];
  const nonBank = docs.filter(doc => doc.kind !== 'bank');
  if (code === 'XX') {
    return docs.find(doc => doc.kind === 'bank' && /UNADJ/i.test(doc.transactionType || ''))
      || docs.find(doc => doc.kind === 'bank')
      || null;
  }
  if (code === 'OA' || code === 'OF') return docs.find(doc => doc.kind === 'bank') || nonBank[0] || null;
  if (code === 'J2') return nonBank.find(doc => doc.kind === 'journal') || nonBank[0] || null;
  return nonBank[0] || null;
}

function directionFor(code, amount, doc) {
  if (code === 'XX' || doc?.billType === 'unadj_payment') return 'deduct';
  if (doc?.kind === 'note') return getAdjustDirection(doc.noteKind, doc.noteSide);
  if (isSalesGoodsReturn(doc?.transactionType) || isPurchaseReturn(doc?.transactionType)) return 'deduct';
  return amount < 0 ? 'deduct' : 'add';
}

async function addModel(prisma, userId, docs, spec) {
  const rows = await prisma[spec.model].findMany({ where: { userId }, select: spec.select });
  let tagged = 0;
  for (const row of rows) {
    const match = String(row.remarks || '').match(TAG);
    if (!match) continue;
    tagged += 1;
    const key = `${match[1]}|${Number(match[2])}`;
    const doc = spec.toDoc(row);
    doc.id = row.id;
    doc.kind = spec.kind;
    doc.billType = spec.billType;
    const list = docs.get(key) || [];
    list.push(doc);
    docs.set(key, list);
  }
  console.log(`${spec.model}: ${tagged} linked vouchers`);
}

function buildAllocation(row, docs, bills, seriesNames) {
  const code = row.billType;
  const billNo = Number(row.billNo);
  const key = `${code}|${Number.isFinite(billNo) ? billNo : row.billNo}`;
  const doc = pickDoc(docs.get(key), code);
  const bill = bills.get(key);
  const label = cleanBillLabel(bill?.BILL, code) || doc?.billNumber || String(row.billNo);
  const amount = round2(Math.abs(row.amount));
  const billAmount = round2(Number(bill?.finalamt) || doc?.billAmount || amount);
  const adjustDirection = directionFor(code, row.amount, doc);
  const billType = code === 'XX' || /UNADJ/i.test(doc?.transactionType || '')
    ? 'unadj_payment'
    : (doc?.billType || 'empire_bill');
  const allocation = {
    billId: doc?.id || `empire:${code}:${row.billNo}`,
    billType,
    billNumber: label,
    transactionType: doc?.transactionType || seriesNames.get(code) || code,
    voucherNumber: label,
    billDate: asIso(doc?.billDate) || asIso(bill?.DATE),
    days: 0,
    billAmount,
    pendingAmount: Math.max(billAmount, amount),
    taxableAmount: round2(doc?.taxableAmount || 0),
    adjustAmount: amount,
    adjustDirection,
    empireBillType: code,
    empireBillNo: String(row.billNo),
    empireAmount: round2(row.amount)
  };
  if (billType === 'unadj_payment') allocation.entryKind = 'unadj_payment';
  if (doc?.kind === 'note') {
    allocation.entryKind = doc.noteKind === 'credit' ? 'credit_note' : 'debit_note';
    allocation.noteKind = doc.noteKind;
    allocation.noteSide = doc.noteSide;
  }
  if (doc?.kind === 'journal') allocation.entryKind = 'journal_voucher';
  return { allocation, linked: Boolean(doc?.id) };
}

export async function repairEmpireBankAllocations(prisma, userId, bills = []) {
  const seriesNames = loadSeriesNames();
  const billIndex = indexBills(bills);
  const docs = new Map();
  const models = [
    {
      model: 'order',
      kind: 'order',
      billType: 'order',
      select: { id: true, remarks: true, transactionType: true, typeBillNumber: true, orderDate: true, buyerName: true },
      toDoc: row => ({
        billNumber: row.typeBillNumber != null ? String(row.typeBillNumber) : '',
        billDate: row.orderDate,
        transactionType: row.transactionType,
        partyName: row.buyerName
      })
    },
    {
      model: 'purchaseBill',
      kind: 'purchase',
      billType: 'purchase_bill',
      select: {
        id: true, remarks: true, transactionType: true, typeBillNumber: true, billDate: true,
        grandTotal: true, billNumber: true, supplierBillNo: true, voucherNumber: true, taxableAmount: true
      },
      toDoc: row => ({
        billNumber: cleanBillLabel(row.supplierBillNo, '') || cleanBillLabel(row.billNumber, '')
          || (row.typeBillNumber != null && row.typeBillNumber < 100000 ? String(row.typeBillNumber) : String(row.voucherNumber || '')),
        billDate: row.billDate,
        billAmount: row.grandTotal,
        taxableAmount: row.taxableAmount,
        transactionType: row.transactionType
      })
    },
    {
      model: 'creditDebitNote',
      kind: 'note',
      billType: 'credit_debit_note',
      select: {
        id: true, remarks: true, noteKind: true, noteSide: true, noteNumber: true,
        noteDate: true, voucherNumber: true, netAmount: true, taxableAmount: true, partyName: true
      },
      toDoc: row => ({
        billNumber: cleanBillLabel(row.noteNumber, '') || (row.voucherNumber != null ? String(row.voucherNumber) : ''),
        billDate: row.noteDate,
        billAmount: row.netAmount,
        taxableAmount: row.taxableAmount,
        noteKind: row.noteKind,
        noteSide: row.noteSide,
        partyName: row.partyName
      })
    },
    {
      model: 'journalVoucher',
      kind: 'journal',
      billType: 'journal_voucher',
      select: {
        id: true, remarks: true, transactionType: true, voucherNumber: true,
        voucherDate: true, amount: true, partyName: true
      },
      toDoc: row => ({
        billNumber: row.voucherNumber || '',
        billDate: row.voucherDate,
        billAmount: row.amount,
        transactionType: row.transactionType,
        partyName: row.partyName
      })
    },
    {
      model: 'greyPurchase',
      kind: 'grey',
      billType: 'grey_purchase',
      select: { id: true, remarks: true, transactionType: true, billNo: true, billDate: true, netAmount: true, partyName: true },
      toDoc: row => ({
        billNumber: cleanBillLabel(row.billNo, '') || '',
        billDate: row.billDate,
        billAmount: row.netAmount,
        transactionType: row.transactionType,
        partyName: row.partyName
      })
    },
    {
      model: 'greyPurchaseReturn',
      kind: 'greyReturn',
      billType: 'grey_return',
      select: { id: true, remarks: true, billNo: true, returnDate: true, netAmount: true, partyName: true },
      toDoc: row => ({
        billNumber: cleanBillLabel(row.billNo, '') || '',
        billDate: row.returnDate,
        billAmount: row.netAmount,
        transactionType: 'GREY PURCHASE RETURN',
        partyName: row.partyName
      })
    },
    {
      model: 'workReceipt',
      kind: 'work',
      billType: 'work_receipt',
      select: {
        id: true, remarks: true, transactionType: true, billNo: true, voucherNo: true,
        receiptDate: true, invoiceValue: true, taxableAmount: true, partyName: true
      },
      toDoc: row => ({
        billNumber: cleanBillLabel(row.billNo, '') || (row.voucherNo != null ? String(row.voucherNo) : ''),
        billDate: row.receiptDate,
        billAmount: row.invoiceValue,
        taxableAmount: row.taxableAmount,
        transactionType: row.transactionType,
        partyName: row.partyName
      })
    },
    {
      model: 'workDespatch',
      kind: 'despatch',
      billType: 'work_despatch',
      select: { id: true, remarks: true, transactionType: true, challanNo: true, despatchDate: true, totalAmount: true, partyName: true },
      toDoc: row => ({
        billNumber: cleanBillLabel(row.challanNo, '') || '',
        billDate: row.despatchDate,
        billAmount: row.totalAmount,
        transactionType: row.transactionType,
        partyName: row.partyName
      })
    },
    {
      model: 'salesOrder',
      kind: 'salesOrder',
      billType: 'sales_order',
      select: { id: true, remarks: true, orderNo: true, orderDate: true, netAmount: true, partyName: true },
      toDoc: row => ({
        billNumber: row.orderNo != null ? String(row.orderNo) : '',
        billDate: row.orderDate,
        billAmount: row.netAmount,
        transactionType: 'SALES ORDERS',
        partyName: row.partyName
      })
    },
    {
      model: 'millReceipt',
      kind: 'mill',
      billType: 'mill_receipt',
      select: { id: true, remarks: true, billNo: true, voucherNo: true, receiptDate: true, netAfterTds: true, millName: true },
      toDoc: row => ({
        billNumber: cleanBillLabel(row.billNo, '') || (row.voucherNo != null ? String(row.voucherNo) : ''),
        billDate: row.receiptDate,
        billAmount: row.netAfterTds,
        transactionType: 'MILL REC.CHALLAN',
        partyName: row.millName
      })
    }
  ];

  for (const spec of models) {
    await addModel(prisma, userId, docs, spec);
  }

  const entries = await prisma.bankEntry.findMany({
    where: { userId },
    select: {
      id: true,
      transactionType: true,
      voucherNumber: true,
      entryDate: true,
      amount: true,
      billNumber: true,
      partyName: true,
      remarks: true,
      billAllocations: true
    }
  });

  let taggedBank = 0;
  for (const entry of entries) {
    const match = String(entry.remarks || '').match(TAG);
    if (!match) continue;
    taggedBank += 1;
    const key = `${match[1]}|${Number(match[2])}`;
    const list = docs.get(key) || [];
    list.push({
      id: entry.id,
      kind: 'bank',
      billType: /UNADJ/i.test(entry.transactionType || '') ? 'unadj_payment' : 'bank_entry',
      billNumber: cleanBillLabel(entry.billNumber, match[1]) || String(entry.voucherNumber || ''),
      billDate: entry.entryDate,
      billAmount: entry.amount,
      transactionType: entry.transactionType,
      partyName: entry.partyName
    });
    docs.set(key, list);
  }
  console.log(`bankEntry: ${taggedBank} linked vouchers`);

  const pending = [];
  for (const entry of entries) {
    const rows = empireRows(entry.billAllocations);
    if (!rows) continue;
    const kept = (Array.isArray(entry.billAllocations) ? entry.billAllocations : [])
      .filter(item => item && item.billId && !item.empireBillNo && !(item.billNo && !item.billId));
    const built = rows
      .filter(row => Math.abs(row.amount) > 0.001)
      .map(row => buildAllocation(row, docs, billIndex, seriesNames));
    const next = [...kept, ...built.map(item => item.allocation)];
    const same = JSON.stringify(entry.billAllocations) === JSON.stringify(next);
    if (same) continue;
    pending.push({ id: entry.id, billAllocations: next, linked: built.filter(item => item.linked).length, unmatched: built.filter(item => !item.linked).length });
  }

  let cursor = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (cursor < pending.length) {
      const job = pending[cursor];
      cursor += 1;
      await prisma.bankEntry.update({
        where: { id: job.id },
        data: { billAllocations: job.billAllocations }
      });
      if (cursor % 200 === 0) console.log(`updated ${cursor} / ${pending.length}`);
    }
  });
  await Promise.all(workers);

  const linked = pending.reduce((sum, job) => sum + job.linked, 0);
  const unmatched = pending.reduce((sum, job) => sum + job.unmatched, 0);
  return { updated: pending.length, linked, unmatched };
}

async function main() {
  dotenv.config({ path: path.join(here, '..', '.env') });
  const prisma = new PrismaClient();
  try {
    const email = 'poonamcreation1012@gmail.com';
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw new Error(`No company for ${email}`);
    const exportDir = process.env.EMPIRE_EXPORT_DIR || path.join(os.tmpdir(), 'poonam-empire-08nov');
    const bills = readTsv(path.join(exportDir, 'bills.tsv'));
    console.log(`Bills in backup export: ${bills.length}`);
    const result = await repairEmpireBankAllocations(prisma, user.id, bills);
    console.log(JSON.stringify(result));

    const seriesList = ['BANK RECEIPT', 'BANK PAYMENT', 'CASH RECEIPT', 'CASH PAYMENT'];
    for (const series of seriesList) {
      const rows = await prisma.bankEntry.findMany({
        where: { userId: user.id, transactionType: series },
        select: { voucherNumber: true, entryDate: true }
      });
      let latest = null;
      for (const row of rows) {
        if (!latest || new Date(row.entryDate) > new Date(latest.entryDate)) latest = row;
      }
      console.log(`${series} count=${rows.length} next=${nextNumberFromVoucherList(rows.map(row => row.voucherNumber))} latest=${latest ? String(latest.entryDate).slice(0, 10) : '-'} no=${latest?.voucherNumber || '-'}`);
    }

    const sample = await prisma.bankEntry.findFirst({
      where: { userId: user.id, transactionType: 'BANK RECEIPT', voucherNumber: '1' },
      select: { amount: true, partyName: true, entryDate: true, billAllocations: true }
    });
    const allocations = Array.isArray(sample?.billAllocations) ? sample.billAllocations : [];
    const net = round2(allocations.reduce((sum, item) => {
      const amount = Number(item.adjustAmount) || 0;
      return sum + (item.adjustDirection === 'deduct' || item.billType === 'unadj_payment' ? -amount : amount);
    }, 0));
    console.log(`BANK RECEIPT 1 ${String(sample?.entryDate || '').slice(0, 10)} amount=${sample?.amount} netPicks=${net}`);
    for (const item of allocations) {
      console.log(`  ${item.billNumber} ${item.transactionType} ${item.adjustDirection} ${item.adjustAmount} linked=${String(item.billId || '').startsWith('empire:') ? 'no' : 'yes'}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].includes('repairEmpireBankAllocations')) {
  main().catch(error => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
