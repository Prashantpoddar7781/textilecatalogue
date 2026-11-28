/**
 * MASTER.TRANSPORT is the account's transporter. The first export omitted it,
 * so Accounts Information Transport was blank. Fills an empty
 * customer.transportName and supplier.transportName. A name already on the
 * account stays. Bills are not rewritten.
 *
 *   node backend/scripts/repairPartyTransport.mjs
 *   TRANSPORT_TSV defaults to %TEMP%\poonam-transport.tsv
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

const EMAIL = 'poonamcreation1012@gmail.com';
const tsvPath = process.env.TRANSPORT_TSV || path.join(os.tmpdir(), 'poonam-transport.tsv');
const prisma = new PrismaClient();

function normName(value) {
  return String(value || '')
    .replace(/\s*\.\s*/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function transportOf(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  return name || '';
}

function readMaster() {
  const lines = fs.readFileSync(tsvPath, 'utf8').split(/\r?\n/).filter(line => line.length);
  const headers = lines[0].split('\t').map(header => header.trim());
  const map = new Map();
  let withTransport = 0;
  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    const row = {};
    headers.forEach((header, index) => { row[header] = cols[index] ?? ''; });
    const name = normName(row.NAME || row.name);
    if (!name || map.has(name)) continue;
    const transport = transportOf(row.TRANSPORT);
    if (transport) withTransport += 1;
    map.set(name, transport);
  }
  return { map, withTransport, rows: lines.length - 1 };
}

const { map, withTransport, rows } = readMaster();
const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
if (!user) throw new Error('Company user was not found');
const userId = user.id;

const [customers, suppliers] = await Promise.all([
  prisma.customer.findMany({
    where: { userId },
    select: { id: true, organizationName: true, transportName: true }
  }),
  prisma.supplier.findMany({
    where: { userId },
    select: { id: true, name: true, transportName: true }
  })
]);

const seen = new Set();
let customersUpdated = 0;
let suppliersUpdated = 0;
let already = 0;

for (const row of customers) {
  const key = normName(row.organizationName);
  seen.add(key);
  const transport = map.get(key) || '';
  if (!transport) continue;
  if (transportOf(row.transportName)) {
    already += 1;
    continue;
  }
  await prisma.customer.update({ where: { id: row.id }, data: { transportName: transport } });
  customersUpdated += 1;
}
for (const row of suppliers) {
  const key = normName(row.name);
  seen.add(key);
  const transport = map.get(key) || '';
  if (!transport) continue;
  if (transportOf(row.transportName)) {
    already += 1;
    continue;
  }
  await prisma.supplier.update({ where: { id: row.id }, data: { transportName: transport } });
  suppliersUpdated += 1;
}

let unmatched = 0;
for (const [name, transport] of map) {
  if (transport && !seen.has(name)) unmatched += 1;
}

console.log(JSON.stringify({
  masterRows: rows,
  withTransport,
  customersUpdated,
  suppliersUpdated,
  already,
  unmatched
}));

await prisma.$disconnect();
