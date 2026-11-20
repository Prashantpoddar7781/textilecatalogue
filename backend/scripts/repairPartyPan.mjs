/**
 * MASTER.PNRNO is the account PAN. The first export left it out, so PAN No.
 * stayed blank and TDS did not fill for a party with no GSTIN.
 * Fills an empty panNumber from that column, then from the GSTIN when PNRNO
 * is blank. Does not replace a PAN already stored.
 *
 *   node backend/scripts/repairPartyPan.mjs
 *   PAN_TSV points at a NAME / PNRNO / gstin export. Default: %TEMP%\poonam-pan.tsv
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { extractPanFromGstin, isValidPan, normalizePan } from '../utils/tds.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

const EMAIL = 'poonamcreation1012@gmail.com';
const tsvPath = process.env.PAN_TSV || path.join(os.tmpdir(), 'poonam-pan.tsv');
const prisma = new PrismaClient();

function normName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function panOf(value) {
  const pan = normalizePan(value);
  return isValidPan(pan) ? pan : '';
}

function readMaster() {
  const lines = fs.readFileSync(tsvPath, 'utf8').split(/\r?\n/).filter(line => line.length);
  const headers = lines[0].split('\t').map(header => header.trim());
  const map = new Map();
  let withPan = 0;
  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    const row = {};
    headers.forEach((header, index) => { row[header] = cols[index] ?? ''; });
    const name = normName(row.NAME || row.name);
    if (!name || map.has(name)) continue;
    const pan = panOf(row.PNRNO) || panOf(extractPanFromGstin(row.gstin || row.GSTNO));
    if (pan) withPan += 1;
    map.set(name, pan);
  }
  return { map, withPan, rows: lines.length - 1 };
}

const { map, withPan, rows } = readMaster();
const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
if (!user) throw new Error('Company user was not found');

const [customers, suppliers] = await Promise.all([
  prisma.customer.findMany({
    where: { userId: user.id },
    select: { id: true, organizationName: true, panNumber: true, gstNumber: true }
  }),
  prisma.supplier.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, panNumber: true, gstNumber: true }
  })
]);

let customersUpdated = 0;
let suppliersUpdated = 0;
let already = 0;
let unmatched = 0;

async function fill(row, name) {
  if (isValidPan(row.panNumber)) {
    already += 1;
    return null;
  }
  const key = normName(name);
  const fromMaster = map.get(key) || '';
  if (!map.has(key)) unmatched += 1;
  const pan = fromMaster || panOf(extractPanFromGstin(row.gstNumber));
  return pan || null;
}

for (const row of customers) {
  const pan = await fill(row, row.organizationName);
  if (!pan) continue;
  await prisma.customer.update({ where: { id: row.id }, data: { panNumber: pan } });
  customersUpdated += 1;
}
for (const row of suppliers) {
  const pan = await fill(row, row.name);
  if (!pan) continue;
  await prisma.supplier.update({ where: { id: row.id }, data: { panNumber: pan } });
  suppliersUpdated += 1;
}

console.log(JSON.stringify({
  masterRows: rows,
  masterWithPan: withPan,
  customersUpdated,
  suppliersUpdated,
  alreadyHadPan: already,
  unmatched
}));
await prisma.$disconnect();
