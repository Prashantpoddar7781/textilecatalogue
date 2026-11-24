/**
 * Puts Empire's Quality Information lists on the books that are already there.
 * Packing, category and screen series come from their own tables.
 * Item type is QUAL.CLOTHTYPE. Grey quality is BASEQUAL, not the quality code.
 *
 *   powershell -File backend/scripts/exportEmpirePoonam.ps1 -MdbPath "...\BACKUP.MDB"
 *   node backend/scripts/repairItemFieldOptions.mjs
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Prisma, PrismaClient } from '@prisma/client';
import { qualItemFields, replaceItemFieldOptions } from '../utils/itemFieldOptions.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

const EMAIL = process.env.REPAIR_EMAIL || 'poonamcreation1012@gmail.com';
const EXPORT_DIR = process.env.EMPIRE_EXPORT_DIR || path.join(os.tmpdir(), 'poonam-empire');
const prisma = new PrismaClient();

function readTsv(name) {
  const file = path.join(EXPORT_DIR, `${name}.tsv`);
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

const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (!user) throw new Error(`No company for ${EMAIL}`);
  const quals = readTsv('qual');
  if (!quals.length) throw new Error(`No qual.tsv in ${EXPORT_DIR}. Export the backup first.`);

  const items = await prisma.salesItemMaster.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, mainScreen: true }
  });
  const byKey = new Map();
  for (const item of items) {
    const key = `${norm(item.name)}|${norm(item.mainScreen)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(item.id);
  }

  let missing = 0;
  const pending = [];
  for (const row of quals) {
    const name = norm(row.NAME || row.qcode);
    const mainScreen = norm(row.MAINSCREEN || row.NAME || 'GENERAL');
    const ids = byKey.get(`${name}|${mainScreen}`);
    if (!ids?.length) {
      missing += 1;
      continue;
    }
    const fields = qualItemFields(row);
    for (const id of ids) pending.push({ id, ...fields });
  }

  let updated = 0;
  for (let i = 0; i < pending.length; i += 200) {
    const chunk = pending.slice(i, i + 200);
    const values = chunk.map(row => Prisma.sql`(
      ${row.id}, ${row.packing}, ${row.unit}, ${row.finishType}, ${row.itemType},
      ${row.screenSeries || ''}, ${row.category || ''}, ${row.greyQuality || ''}
    )`);
    await prisma.$executeRaw`
      UPDATE "SalesItemMaster" AS s SET
        packing = v.packing,
        unit = v.unit,
        "finishType" = v.finish,
        "itemType" = v.item_type,
        "screenSeries" = NULLIF(v.screen, ''),
        category = NULLIF(v.category, ''),
        "greyQuality" = NULLIF(v.grey, '')
      FROM (VALUES ${Prisma.join(values)}) AS v(id, packing, unit, finish, item_type, screen, category, grey)
      WHERE s.id = v.id
    `;
    updated += chunk.length;
  }

  const counts = await replaceItemFieldOptions(prisma, user.id, {
    categories: readTsv('category'),
    packings: readTsv('packing'),
    screens: readTsv('screencomp'),
    quals
  });
  const sample = await prisma.salesItemMaster.findFirst({
    where: { userId: user.id, name: { equals: '24 CARAT', mode: 'insensitive' } },
    select: { name: true, itemType: true, category: true, greyQuality: true, screenSeries: true, packing: true, finishType: true }
  });
  console.log(JSON.stringify({ updated, missing, counts, sample }));
}

main()
  .catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
