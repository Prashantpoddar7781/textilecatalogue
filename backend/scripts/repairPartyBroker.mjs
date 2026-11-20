/**
 * MASTER.ADATIYA is the party's broker. The export left it out, so selecting
 * a party left Broker blank. Fills an empty customer agentName and supplier
 * brokerName, then copies that name onto entries made after the import whose
 * broker is still blank. An Empire bill that already has BILLS.BCODE is left
 * as it was.
 *
 *   node backend/scripts/repairPartyBroker.mjs
 *   BROKER_TSV defaults to %TEMP%\poonam-broker.tsv
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
const tsvPath = process.env.BROKER_TSV || path.join(os.tmpdir(), 'poonam-broker.tsv');
const prisma = new PrismaClient();

function normName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function brokerOf(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  return name || '';
}

function readMaster() {
  const lines = fs.readFileSync(tsvPath, 'utf8').split(/\r?\n/).filter(line => line.length);
  const headers = lines[0].split('\t').map(header => header.trim());
  const map = new Map();
  let withBroker = 0;
  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    const row = {};
    headers.forEach((header, index) => { row[header] = cols[index] ?? ''; });
    const name = normName(row.NAME || row.name);
    if (!name || map.has(name)) continue;
    const broker = brokerOf(row.ADATIYA);
    if (broker) withBroker += 1;
    map.set(name, broker);
  }
  return { map, withBroker, rows: lines.length - 1 };
}

function empireTagged(remarks) {
  return /\[E:/i.test(String(remarks || ''));
}

const { map, withBroker, rows } = readMaster();
const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
if (!user) throw new Error('Company user was not found');
const userId = user.id;

const [customers, suppliers] = await Promise.all([
  prisma.customer.findMany({
    where: { userId },
    select: { id: true, organizationName: true, agentName: true }
  }),
  prisma.supplier.findMany({
    where: { userId },
    select: { id: true, name: true, brokerName: true }
  })
]);

let customersUpdated = 0;
let suppliersUpdated = 0;
let already = 0;

for (const row of customers) {
  if (brokerOf(row.agentName)) {
    already += 1;
    continue;
  }
  const broker = map.get(normName(row.organizationName));
  if (!broker) continue;
  await prisma.customer.update({ where: { id: row.id }, data: { agentName: broker } });
  row.agentName = broker;
  customersUpdated += 1;
}
for (const row of suppliers) {
  if (brokerOf(row.brokerName)) {
    already += 1;
    continue;
  }
  const broker = map.get(normName(row.name));
  if (!broker) continue;
  await prisma.supplier.update({ where: { id: row.id }, data: { brokerName: broker } });
  row.brokerName = broker;
  suppliersUpdated += 1;
}

const customerById = new Map(customers.map(row => [row.id, brokerOf(row.agentName)]));
const supplierById = new Map(suppliers.map(row => [row.id, brokerOf(row.brokerName)]));
const eitherByName = new Map();
for (const row of customers) {
  const broker = brokerOf(row.agentName);
  if (broker) eitherByName.set(normName(row.organizationName), broker);
}
for (const row of suppliers) {
  const broker = brokerOf(row.brokerName);
  if (broker) eitherByName.set(normName(row.name), broker);
}

function partyBroker(name, idMap, id, nameMap) {
  return (id && idMap.get(id)) || nameMap.get(normName(name)) || '';
}

async function fillBlank(model, field, nameOf, idOf, idMap, nameMap) {
  const found = await prisma[model].findMany({
    where: { userId },
    select: { id: true, remarks: true, [field]: true, ...nameOf.select, ...idOf.select }
  });
  let updated = 0;
  for (const row of found) {
    if (brokerOf(row[field]) || empireTagged(row.remarks)) continue;
    const broker = partyBroker(nameOf.read(row), idMap, idOf.read(row), nameMap);
    if (!broker) continue;
    await prisma[model].update({ where: { id: row.id }, data: { [field]: broker } });
    updated += 1;
  }
  return updated;
}

const entries = {
  sale: await fillBlank(
    'order',
    'agentName',
    { select: { buyerName: true }, read: row => row.buyerName },
    { select: { customerId: true }, read: row => row.customerId },
    customerById,
    eitherByName
  ),
  salesOrder: await fillBlank(
    'salesOrder',
    'brokerName',
    { select: { partyName: true }, read: row => row.partyName },
    { select: { customerId: true }, read: row => row.customerId },
    customerById,
    eitherByName
  ),
  purchase: await fillBlank(
    'purchaseBill',
    'agentName',
    { select: {}, read: () => '' },
    { select: { supplierId: true }, read: row => row.supplierId },
    supplierById,
    eitherByName
  ),
  greyPurchase: await fillBlank(
    'greyPurchase',
    'brokerName',
    { select: { partyName: true }, read: row => row.partyName },
    { select: { supplierId: true }, read: row => row.supplierId },
    supplierById,
    eitherByName
  ),
  greyReturn: await fillBlank(
    'greyPurchaseReturn',
    'brokerName',
    { select: { partyName: true }, read: row => row.partyName },
    { select: {}, read: () => '' },
    supplierById,
    eitherByName
  ),
  workDespatch: await fillBlank(
    'workDespatch',
    'brokerName',
    { select: { partyName: true }, read: row => row.partyName },
    { select: {}, read: () => '' },
    supplierById,
    eitherByName
  ),
  workReceipt: await fillBlank(
    'workReceipt',
    'brokerName',
    { select: { partyName: true }, read: row => row.partyName },
    { select: {}, read: () => '' },
    supplierById,
    eitherByName
  )
};

console.log(JSON.stringify({
  masterRows: rows,
  masterWithBroker: withBroker,
  customersUpdated,
  suppliersUpdated,
  alreadyHadBroker: already,
  entries
}));
await prisma.$disconnect();
