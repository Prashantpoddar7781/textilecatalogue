/**
 * Loads an Empire backup (exported by exportEmpirePoonam.ps1) into one company.
 *
 *   powershell -File backend/scripts/exportEmpirePoonam.ps1 -MdbPath "...\BACKUP.MDB"
 *   $env:POONAM_PASSWORD = '...'
 *   node backend/scripts/importEmpirePoonam.mjs
 *
 * Writes only the poonamcreation1012@gmail.com company. Re-running replaces that
 * company's books. Account heads stay under their Empire account-type name.
 * Bill series use the Transaction Types master name for that series code.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

const EMAIL = 'poonamcreation1012@gmail.com';
const EXPORT_DIR = process.env.EMPIRE_EXPORT_DIR || path.join(os.tmpdir(), 'poonam-empire');
const SERIES_TSV = path.join(here, '..', 'constants', 'data', 'transactionTypes.tsv');
const COMPANY_FALLBACK = {
  legalName: 'POONAM CREATION',
  tradeName: 'POONAM CREATION',
  city: 'SURAT',
  state: 'GUJARAT',
  gstNumber: '24APBPP0006P1Z1',
  panNumber: 'APBPP0006P'
};

const SALES_INVOICE = new Set(['S1', 'S4', 'S5', 'S6', 'S51']);
const SALES_CHALLAN = new Set(['O57']);
const SALES_ORDER = new Set(['O1']);
const SALES_RETURN = new Set(['P3']);
const GREY_PURCHASE = new Set(['P1']);
const GREY_RETURN = new Set(['S2']);
const WORK_DESP = new Set(['O5', 'O7', 'O11', 'O12', 'O15', 'O45', 'O41']);
const WORK_REC = new Set(['P5', 'P7', 'P9', 'P11', 'P13', 'P15', 'P31', 'P45', 'J1']);
const BANK_BILL = new Set(['XX', 'OA', 'OF']);
const NOTE = {
  P91: ['credit', 'sales'],
  S91: ['debit', 'sales'],
  S66: ['credit', 'sales'],
  P66: ['debit', 'sales'],
  S77: ['credit', 'sales'],
  P77: ['debit', 'purchase'],
  S92: ['debit', 'purchase'],
  P92: ['credit', 'purchase']
};
const FAS_BANK = new Set(['B1', 'B2', 'C1', 'C2']);

const prisma = new PrismaClient();

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

function num(value) {
  if (value == null || value === '') return 0;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function int(value, fallback = 0) {
  const n = Math.round(num(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(-2000000000, Math.min(2000000000, n));
}

function text(value, max = 180) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return max ? clean.slice(0, max) : clean;
}

function norm(value) {
  return text(value, 0).toUpperCase();
}

function parseDate(value) {
  const raw = text(value, 40);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return new Date(`${raw.slice(0, 10)}T12:00:00+05:30`);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return new Date('2018-04-01T12:00:00+05:30');
}

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

function loadSeriesNames() {
  const map = new Map();
  if (!fs.existsSync(SERIES_TSV)) return map;
  for (const line of fs.readFileSync(SERIES_TSV, 'utf8').split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const [name, code] = line.split('\t');
    if (code && name) map.set(code.trim(), name.trim());
  }
  return map;
}

function gstOf(row, rateKey = 'VATRATE', addKey = 'ADD_VATRATE', amtKey = 'VATAMT', addAmtKey = 'ADD_VATAMT') {
  const vatRate = num(row[rateKey]);
  const addRate = num(row[addKey]);
  const vatAmt = num(row[amtKey]);
  const addAmt = num(row[addAmtKey]);
  if (addRate > 0 || addAmt > 0) {
    return {
      gstRate: round(vatRate + addRate),
      cgstRate: vatRate,
      sgstRate: addRate,
      igstRate: 0,
      cgstAmount: round(vatAmt),
      sgstAmount: round(addAmt),
      igstAmount: 0,
      totalTax: round(vatAmt + addAmt)
    };
  }
  return {
    gstRate: vatRate,
    cgstRate: 0,
    sgstRate: 0,
    igstRate: vatRate,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: round(vatAmt),
    totalTax: round(vatAmt)
  };
}

function simpleBillNumber(bill, vno) {
  const raw = text(bill.BILL, 40);
  const match = raw.match(/^(\d+)/);
  if (match) {
    const printed = Number(match[1]);
    if (printed > 0 && printed < 100000) return printed;
  }
  const internal = int(vno);
  if (internal >= 100000) return internal % 100000;
  return internal || null;
}

function orderRefOf(bill, simple) {
  const ref = text(bill.ORDERNO, 40);
  const leading = ref.match(/^(\d+)/);
  if (!ref || ref === '0' || (leading && leading[1] === String(simple || ''))) return null;
  return ref.replace(/\*/g, '');
}

function billAmounts(row, lineSum) {
  const billAmt = num(row.BILLAMT);
  const gross = num(row.grossamt);
  const finalAmt = num(row.finalamt);
  const tax = num(row.VATAMT) + num(row.ADD_VATAMT);
  const taxable = lineSum || billAmt || gross || Math.max(0, finalAmt - tax);
  const net = finalAmt || round(taxable + tax) || taxable;
  return {
    taxable: round(taxable),
    tax: round(tax),
    net: round(net),
    gross: round(gross || taxable)
  };
}

async function batches(rows, size, write) {
  for (let index = 0; index < rows.length; index += size) {
    const slice = rows.slice(index, index + size);
    if (slice.length) await write(slice);
    if (index && index % 1000 === 0) console.log(`  ${index} rows`);
  }
}

function seriesName(code, seriesNames, empireNames) {
  return seriesNames.get(code) || empireNames.get(code) || code || 'JOURNAL';
}

function tag(type, vno, remark) {
  const note = text(remark, 500);
  return `[E:${type}:${vno}]${note ? ` ${note}` : ''}`;
}

async function wipeCompany(userId) {
  await prisma.millReceipt.deleteMany({ where: { userId } });
  await prisma.cuttingCard.deleteMany({ where: { userId } });
  await prisma.greyPurchaseReturn.deleteMany({ where: { userId } });
  await prisma.greyDispatch.deleteMany({ where: { userId } });
  await prisma.greyPurchase.deleteMany({ where: { userId } });
  await prisma.workReceipt.deleteMany({ where: { userId } });
  await prisma.workDespatch.deleteMany({ where: { userId } });
  await prisma.purchaseBill.deleteMany({ where: { userId } });
  await prisma.bankEntry.deleteMany({ where: { userId } });
  await prisma.creditDebitNote.deleteMany({ where: { userId } });
  await prisma.journalVoucher.deleteMany({ where: { userId } });
  await prisma.gstReconciliation.deleteMany({ where: { userId } });
  await prisma.gstPortalStatement.deleteMany({ where: { userId } });
  await prisma.salesInvoice.deleteMany({ where: { userId } });
  await prisma.order.deleteMany({ where: { userId } });
  await prisma.salesOrder.deleteMany({ where: { userId } });
  await prisma.salesItemMaster.deleteMany({ where: { userId } });
  await prisma.customer.deleteMany({ where: { userId } });
  await prisma.supplier.deleteMany({ where: { userId } });
}

async function main() {
  const password = process.env.POONAM_PASSWORD;
  if (!password) throw new Error('Set POONAM_PASSWORD before running the import.');
  if (!fs.existsSync(path.join(EXPORT_DIR, 'bills.tsv'))) {
    throw new Error(`Export not found in ${EXPORT_DIR}. Run exportEmpirePoonam.ps1 first.`);
  }
  const dbHost = process.env.DATABASE_URL || '';
  console.log(dbHost.includes('localhost') || dbHost.includes('127.0.0.1') ? 'database: local' : 'database: remote');

  const seriesNames = loadSeriesNames();
  const empireSeries = new Map(readTsv('series').map(row => [text(row.SERIESCODE, 12), text(row.SERIES, 80)]));
  const typeNames = new Map(readTsv('atype').map(row => [String(int(row.ATYPE)), text(row.NAME, 80)]));
  const groups = new Map(readTsv('acgroup').map(row => [text(row.gcode, 40), text(row.NAME, 80)]));
  const companyRow = readTsv('company')[0] || {};
  const companyName = text(companyRow.FIRM || COMPANY_FALLBACK.legalName, 120);

  console.log('Reading Empire tables...');
  const masters = readTsv('master');
  const quals = readTsv('qual');
  const bills = readTsv('bills');
  const billdet = readTsv('billdet');
  const fas = readTsv('fas');
  const recpay = readTsv('recpay');
  const pinv = readTsv('pinvtrn');
  const millrec = readTsv('millrec');
  const cutdet = readTsv('cutdet');
  const chaltrn = readTsv('chaltrn');
  console.log(`masters ${masters.length}, qualities ${quals.length}, bills ${bills.length}, lines ${billdet.length}, ledger ${fas.length}`);

  const linesByBill = new Map();
  for (const line of billdet) {
    const key = `${text(line.TYPE, 12)}|${int(line.VNO)}`;
    const list = linesByBill.get(key) || [];
    list.push(line);
    linesByBill.set(key, list);
  }
  const takaByCard = new Map();
  for (const row of chaltrn) {
    const card = text(row.CARDNO, 40);
    if (!card) continue;
    const metres = num(row.WMTS) || num(row.MMTS) || num(row.RMTS) || num(row.CMTS);
    if (metres <= 0) continue;
    const list = takaByCard.get(card) || [];
    list.push({ srNo: list.length + 1, mts: round(metres) });
    takaByCard.set(card, list);
  }
  const allocByVoucher = new Map();
  for (const row of recpay) {
    const key = `${text(row.RECTYPE, 12)}|${int(row.RECVNO)}`;
    const list = allocByVoucher.get(key) || [];
    list.push({
      billType: text(row.BILLTYPE, 12),
      billNo: text(row.BILLVNO, 40),
      amount: round(num(row.AMT))
    });
    allocByVoucher.set(key, list);
  }

  const hashed = await bcrypt.hash(password, 10);
  let user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: companyName,
        firmName: companyName,
        password: hashed,
        freeOverride: true,
        subscriptionStatus: 'active',
        subscriptionPlan: 'yearly',
        subscriptionSource: 'manual'
      }
    });
    console.log('Replacing existing books for this company...');
    await wipeCompany(user.id);
  } else {
    user = await prisma.user.create({
      data: {
        email: EMAIL,
        name: companyName,
        firmName: companyName,
        password: hashed,
        freeOverride: true,
        subscriptionStatus: 'active',
        subscriptionPlan: 'yearly',
        subscriptionSource: 'manual',
        subscriptionStartedAt: new Date()
      }
    });
  }
  const userId = user.id;

  await prisma.businessProfile.upsert({
    where: { userId },
    update: {
      legalName: companyName,
      tradeName: text(companyRow.SHORTNAME || companyName, 120) || companyName,
      gstNumber: text(companyRow.COMPANY_GSTIN || COMPANY_FALLBACK.gstNumber, 15),
      panNumber: text(companyRow.PANNO || COMPANY_FALLBACK.panNumber, 10),
      addressLine1: text(companyRow.ADDRESS1, 180) || null,
      addressLine2: text([companyRow.ADDRESS2, companyRow.ADDRESS3].filter(Boolean).join(', '), 180) || null,
      city: text(companyRow.CITY1 || COMPANY_FALLBACK.city, 80),
      state: text(companyRow.STATE1 || COMPANY_FALLBACK.state, 80),
      pincode: text(companyRow.CPINNO, 10) || null,
      phone: text(companyRow.PHONE1, 30) || null,
      mobileNumber: text(companyRow.MOBILE, 20) || null,
      email: text(companyRow.EMAIL, 120) || null,
      companyType: text(companyRow.COMPANYTYPE, 40) || null,
      ewbMode: 'mock'
    },
    create: {
      userId,
      legalName: companyName,
      tradeName: companyName,
      gstNumber: text(companyRow.COMPANY_GSTIN || COMPANY_FALLBACK.gstNumber, 15),
      panNumber: text(companyRow.PANNO || COMPANY_FALLBACK.panNumber, 10),
      addressLine1: text(companyRow.ADDRESS1, 180) || null,
      addressLine2: text([companyRow.ADDRESS2, companyRow.ADDRESS3].filter(Boolean).join(', '), 180) || null,
      city: text(companyRow.CITY1 || COMPANY_FALLBACK.city, 80),
      state: text(companyRow.STATE1 || COMPANY_FALLBACK.state, 80),
      pincode: text(companyRow.CPINNO, 10) || null,
      phone: text(companyRow.PHONE1, 30) || null,
      mobileNumber: text(companyRow.MOBILE, 20) || null,
      email: text(companyRow.EMAIL, 120) || null,
      companyType: text(companyRow.COMPANYTYPE, 40) || null,
      ewbMode: 'mock'
    }
  });

  const parties = new Map();
  for (const row of masters) {
    const name = text(row.NAME || row.code, 180);
    const key = norm(name);
    if (!key || parties.has(key)) continue;
    const typeName = typeNames.get(String(int(row.ATYPE))) || 'OTHER';
    const gst = text(row.gstin || row.GSTNO, 15);
    parties.set(key, {
      name,
      accountType: typeName,
      debtor: /DEBTOR/i.test(typeName),
      accountGroup: groups.get(text(row.GCODE, 40)) || null,
      gst: gst || null,
      mobile: text(row.MOBILE || row.PHONE1, 20) || null,
      email: text(row.EMAIL, 120) || null,
      address: text([row.ADDRESS1, row.ADDRESS2, row.ADDRESS3].filter(Boolean).join(', '), 240) || null,
      city: text(row.CITY1, 80) || null,
      state: text(row.STATE1 || row.STATION, 80) || null,
      pincode: text(row.PINNO, 10) || null,
      contact: text(row.CONTACT, 80) || null,
      dhara: num(row.dhara) || null,
      graceDays: int(row.crdays) || null,
      interestRate: num(row.DRINTRATE) || null,
      brokerPercent: num(row.commission) || null,
      udyam: text(row.MSME_NO, 40) || null,
      msmeType: text(row.MSME_TYPE, 40) || null,
      remark: text(row.FLASH_RMK, 240) || null
    });
  }

  function ensureParty(name, debtor) {
    const clean = text(name, 180);
    const key = norm(clean);
    if (!key) return null;
    if (!parties.has(key)) {
      parties.set(key, {
        name: clean,
        accountType: debtor ? 'SUNDRY DEBTORS' : 'OTHER',
        debtor: Boolean(debtor),
        accountGroup: null,
        gst: null,
        mobile: null,
        address: null,
        city: null,
        state: null,
        pincode: null,
        contact: null,
        dhara: null,
        graceDays: null,
        interestRate: null,
        brokerPercent: null,
        udyam: null,
        msmeType: null,
        remark: 'Created from a voucher whose account head was not in the master'
      });
    }
    return parties.get(key);
  }

  const billTypes = new Set();
  for (const bill of bills) {
    const code = text(bill.TYPE, 12);
    billTypes.add(code);
    const party = ensureParty(bill.code, SALES_INVOICE.has(code) || SALES_CHALLAN.has(code) || SALES_RETURN.has(code) || SALES_ORDER.has(code));
    if (party && (SALES_INVOICE.has(code) || SALES_CHALLAN.has(code) || SALES_RETURN.has(code) || SALES_ORDER.has(code))) {
      party.debtor = true;
    }
  }

  console.log(`Writing ${parties.size} account heads...`);
  const customers = [];
  const suppliers = [];
  for (const party of parties.values()) {
    const shared = {
      userId,
      gstNumber: party.gst,
      mobileNumber: party.mobile,
      address: party.address,
      city: party.city,
      state: party.state,
      pincode: party.pincode,
      accountType: party.accountType,
      accountGroup: party.accountGroup,
      graceDays: party.graceDays,
      dhara: party.dhara,
      interestRate: party.interestRate,
      brokerPercent: party.brokerPercent,
      contactPersonName: party.contact
    };
    if (party.debtor) {
      customers.push({
        ...shared,
        organizationName: party.name,
        remark: party.remark
      });
    } else {
      suppliers.push({
        ...shared,
        name: party.name,
        udyamNumber: party.udyam,
        msmeType: party.msmeType,
        remark: party.remark
      });
    }
  }
  await batches(customers, 200, (rows) => prisma.customer.createMany({ data: rows }));
  await batches(suppliers, 200, (rows) => prisma.supplier.createMany({ data: rows }));

  const customerRows = await prisma.customer.findMany({
    where: { userId },
    select: { id: true, organizationName: true, gstNumber: true, state: true }
  });
  const supplierRows = await prisma.supplier.findMany({
    where: { userId },
    select: { id: true, name: true, gstNumber: true, state: true }
  });
  const customerByName = new Map(customerRows.map(row => [norm(row.organizationName), row]));
  const supplierByName = new Map(supplierRows.map(row => [norm(row.name), row]));

  console.log(`Writing ${quals.length} qualities...`);
  const seenItems = new Set();
  const items = [];
  for (const row of quals) {
    const name = text(row.NAME || row.qcode, 160);
    const mainScreen = text(row.MAINSCREEN || row.NAME || 'GENERAL', 160);
    if (!name) continue;
    const key = `${norm(name)}|${norm(mainScreen)}`;
    if (seenItems.has(key)) continue;
    seenItems.add(key);
    const cloth = text(row.CLOTHTYPE, 40).toUpperCase();
    items.push({
      userId,
      name,
      mainScreen,
      packing: text(row.PACKING, 40) || 'NAKED',
      cut: num(row.CUT),
      finishType: cloth.includes('GREY') ? 'GREY' : 'FINISH',
      itemType: text(row.category, 40) || 'SAREE',
      category: text(row.category, 40) || null,
      unit: text(row.UNIT, 20) || 'PCS',
      sellingRate: num(row.SELL1),
      rate2: num(row.SELL2),
      rate3: num(row.SELL3),
      hsnSac: text(row.hsn_code, 20) || null,
      gstRate: num(row.GSTRATE) || round(num(row.VATRATE) + num(row.ADD_VATRATE)),
      greyQuality: text(row.qcode, 40) || null
    });
  }
  await batches(items, 200, (rows) => prisma.salesItemMaster.createMany({ data: rows }));

  function priceBasis(pcs, mts, rate, amount, unit) {
    const piece = pcs * rate;
    const metre = mts * rate;
    const near = (base) => base > 0 && Math.abs(base - amount) <= 1;
    const discOf = (base) => {
      if (!(base > amount + 0.05) || base <= 0) return null;
      const pct = (base - amount) / base * 100;
      if (pct > 35) return null;
      return Math.round(pct * 10000) / 10000;
    };
    if (near(piece) && !near(metre)) return { unit: unit || 'PCS', discountPercent: 0 };
    if (near(metre)) return { unit: 'MTS', discountPercent: 0 };
    const metreDisc = discOf(metre);
    const pieceDisc = discOf(piece);
    if (metreDisc != null && pieceDisc == null) return { unit: 'MTS', discountPercent: metreDisc };
    if (pieceDisc != null && metreDisc == null) return { unit: unit || 'PCS', discountPercent: pieceDisc };
    if (metreDisc != null && pieceDisc != null) {
      return metreDisc <= pieceDisc
        ? { unit: 'MTS', discountPercent: metreDisc }
        : { unit: unit || 'PCS', discountPercent: pieceDisc };
    }
    if (/MTS|MTR|METRE|METER/i.test(unit) && mts > 0) return { unit: 'MTS', discountPercent: 0 };
    return { unit: unit || 'PCS', discountPercent: 0 };
  }

  function saleLines(bill) {
    const key = `${text(bill.TYPE, 12)}|${int(bill.VNO)}`;
    const rawLines = linesByBill.get(key) || [];
    const gst = gstOf(bill);
    const built = (rawLines.length ? rawLines : [{
      qual: bill.QUAL || 'Item',
      PCS: bill.TOTPCS,
      MTS: bill.TOTMTS,
      CUT: 0,
      RATE: bill.RATE,
      AMT: num(bill.BILLAMT) || num(bill.grossamt) || num(bill.finalamt),
      PACK: '',
      UNIT: 'PCS',
      hsn_code: bill.BILLS_HSN_CODE,
      DETAILS: ''
    }]).map((line, index) => {
      let amount = round(num(line.AMT) || (num(line.PCS) * num(line.RATE)));
      const pcs = num(line.PCS);
      const mts = num(line.MTS);
      let rate = num(line.RATE);
      const headerTax = index === 0 ? gst.totalTax : 0;
      if (!(rate > 0) && amount > 0) {
        let taxable = amount;
        if (gst.gstRate > 0 && headerTax > 0 && headerTax < amount) {
          const included = round((amount - headerTax) * gst.gstRate / 100);
          const extra = round(amount * gst.gstRate / 100);
          if (Math.abs(included - headerTax) <= 1 && Math.abs(extra - headerTax) > 1) taxable = round(amount - headerTax);
        }
        const unitGuess = text(line.UNIT, 20) || 'PCS';
        const metre = /MTS|MTR|METRE|METER/i.test(unitGuess);
        const qty = metre ? (mts || pcs) : (pcs || mts);
        if (qty > 0) {
          rate = round(taxable / qty);
          amount = round(qty * rate);
        }
      }
      const quantity = pcs > 0 ? Math.max(1, Math.round(pcs)) : (amount !== 0 ? 1 : 0);
      const itemName = text(line.qual || line.DETAILS || bill.QUAL || 'Item', 160);
      const priced = priceBasis(pcs, mts, rate, amount, text(line.UNIT, 20) || 'PCS');
      return {
        lineNo: index + 1,
        itemName,
        description: itemName,
        designName: itemName,
        screenName: itemName,
        mainScreen: itemName,
        packing: text(line.PACK, 40) || 'NAKED',
        unit: priced.unit,
        pcs: round(pcs),
        cut: round(num(line.CUT)),
        mtsQty: round(mts),
        rate: round(rate),
        amount,
        discountPercent: priced.discountPercent,
        discountAmount: 0,
        quantity,
        retailPrice: quantity ? round(amount / quantity) : 0,
        basePrice: quantity ? round(amount / quantity) : 0,
        taxableAmount: amount,
        gstRate: gst.gstRate,
        cgstRate: index === 0 ? gst.cgstRate : 0,
        sgstRate: index === 0 ? gst.sgstRate : 0,
        igstRate: index === 0 ? gst.igstRate : 0,
        cgstAmount: index === 0 ? gst.cgstAmount : 0,
        sgstAmount: index === 0 ? gst.sgstAmount : 0,
        igstAmount: index === 0 ? gst.igstAmount : 0,
        taxAmount: index === 0 ? gst.totalTax : 0,
        totalAmount: round(amount + (index === 0 ? gst.totalTax : 0)),
        hsnCode: text(line.hsn_code || bill.BILLS_HSN_CODE, 20) || '5407',
        completed: true,
        completedAt: new Date().toISOString()
      };
    }).filter(line => line.itemName);
    if (!built.length) {
      built.push({
        lineNo: 1,
        itemName: 'Item',
        description: 'Item',
        quantity: 1,
        pcs: 1,
        rate: 0,
        amount: 0,
        retailPrice: 0,
        taxableAmount: 0,
        completed: true
      });
    }
    const lineSum = round(built.reduce((sum, line) => sum + (Number(line.amount) || 0), 0));
    const amounts = billAmounts(bill, lineSum);
    return { lines: built, amounts, gst, lineSum };
  }

  const orders = [];
  const salesOrders = [];
  const purchases = [];
  const greyPurchases = [];
  const greyReturns = [];
  const workDespatches = [];
  const workReceipts = [];
  const notes = [];
  const bankFromBills = [];
  const otherBills = [];
  const usedOrderNos = new Set();

  for (const bill of bills) {
    const code = text(bill.TYPE, 12);
    const vno = int(bill.VNO);
    const name = seriesName(code, seriesNames, empireSeries);
    const partyName = text(bill.code, 180) || 'UNSPECIFIED';
    const party = parties.get(norm(partyName));
    const { lines, amounts, gst, lineSum } = saleLines(bill);
    const when = parseDate(bill.DATE);
    const billNo = text(bill.BILL, 40) || String(vno);
    const sharedParty = {
      partyGstin: party?.gst || null,
      placeOfSupply: party?.state || null,
      stateCode: text(bill.STATE_CODE, 8) || null
    };

    if (SALES_ORDER.has(code)) {
      let orderNo = vno || salesOrders.length + 1;
      while (usedOrderNos.has(orderNo)) orderNo += 1;
      usedOrderNos.add(orderNo);
      salesOrders.push({
        userId,
        customerId: customerByName.get(norm(partyName))?.id || null,
        companyName,
        partyName,
        partyGstin: party?.gst || null,
        state: party?.state || null,
        station: text(bill.PLACE, 80) || null,
        transportName: text(bill.TRANSPORT, 80) || null,
        vehicleNo: text(bill.vehicle_NO, 30) || null,
        lrNo: text(bill.RRNO, 40) || null,
        orderNo,
        orderDate: when,
        haste: text(bill.haste, 80) || null,
        remarks: tag(code, vno, bill.RMK),
        hsnCode: text(bill.BILLS_HSN_CODE, 20) || '5407',
        lineItems: lines,
        totalPcs: round(num(bill.TOTPCS)),
        totalMts: round(num(bill.TOTMTS)),
        grossAmount: amounts.gross,
        taxableAmount: amounts.taxable,
        totalTaxAmount: amounts.tax,
        netAmount: amounts.net,
        status: 'open'
      });
      continue;
    }

    if (SALES_INVOICE.has(code) || SALES_CHALLAN.has(code) || SALES_RETURN.has(code)) {
      const customer = customerByName.get(norm(partyName));
      const simpleNo = simpleBillNumber(bill, vno);
      orders.push({
        userId,
        customerId: customer?.id || null,
        buyerName: partyName,
        buyerPhone: party?.mobile || '-',
        quantity: Math.max(1, int(bill.TOTPCS, 1)),
        orderLines: lines,
        status: SALES_CHALLAN.has(code) ? 'posted' : 'completed',
        remarks: tag(code, vno, bill.RMK),
        manualType: 'erp_sales',
        transactionType: SALES_RETURN.has(code) ? 'SALES GOODS RETURN' : name,
        typeBillNumber: simpleNo,
        invoiceNumber: null,
        orderNumber: orderRefOf(bill, simpleNo),
        agentName: text(bill.BCODE, 80) || null,
        transportName: text(bill.TRANSPORT, 80) || null,
        discountRate: 0,
        shippingCharge: round(amounts.net - lineSum),
        orderDate: when,
        haste: text(bill.haste, 80) || null,
        station: text(bill.PLACE, 80) || null,
        challanNo: text(bill.CHALLAN, 40) || null,
        gstType: gst.igstAmount > 0 ? 'igst' : 'cgst',
        lrNo: text(bill.RRNO, 40) || null,
        vehicleNo: text(bill.vehicle_NO, 40) || null,
        dhara: num(bill.PAYDAYS) || null,
        grace: num(bill.GRACEDAYS) || null,
        ewayBillNo: text(bill.EWB_NO, 40) || null
      });
      continue;
    }

    if (GREY_PURCHASE.has(code)) {
      const supplier = supplierByName.get(norm(partyName));
      greyPurchases.push({
        userId,
        supplierId: supplier?.id || null,
        companyName,
        partyName,
        partyGstin: party?.gst || null,
        quality: text(lines[0]?.itemName || bill.QUAL, 160) || null,
        srNo: vno || null,
        hsnCode: text(bill.BILLS_HSN_CODE, 20) || null,
        billNo,
        billDate: when,
        transactionType: name,
        typeBillNumber: vno || null,
        recTaka: round(num(bill.TOTPCS)),
        recMts: round(num(bill.TOTMTS)),
        purRate: round(num(bill.RATE)),
        lineItems: lines,
        grossAmount: amounts.gross,
        taxableAmount: amounts.taxable,
        gstRate: gst.gstRate,
        cgstRate: gst.cgstRate,
        cgstAmount: gst.cgstAmount,
        sgstRate: gst.sgstRate,
        sgstAmount: gst.sgstAmount,
        igstRate: gst.igstRate,
        igstAmount: gst.igstAmount,
        totalTaxAmount: gst.totalTax,
        payableAmount: amounts.net,
        netAmount: amounts.net,
        placeOfSupply: party?.state || null,
        stateCode: text(bill.STATE_CODE, 8) || null,
        remarks: tag(code, vno, bill.RMK),
        status: 'posted'
      });
      continue;
    }

    if (GREY_RETURN.has(code)) {
      greyReturns.push({
        userId,
        companyName,
        entryType: 'GREY PURCHASE',
        voucherNo: vno || null,
        quality: text(lines[0]?.itemName || bill.QUAL, 160) || null,
        hsnCode: text(bill.BILLS_HSN_CODE, 20) || null,
        partyName,
        partyGstin: party?.gst || null,
        billNo,
        returnDate: when,
        pcs: round(num(bill.TOTPCS)),
        mts: round(num(bill.TOTMTS)),
        rate: round(num(bill.RATE)),
        grossAmount: amounts.gross,
        taxableAmount: amounts.taxable,
        gstRate: gst.gstRate,
        cgstRate: gst.cgstRate,
        cgstAmount: gst.cgstAmount,
        sgstRate: gst.sgstRate,
        sgstAmount: gst.sgstAmount,
        igstRate: gst.igstRate,
        igstAmount: gst.igstAmount,
        netAmount: amounts.net,
        placeOfSupply: party?.state || null,
        remarks: tag(code, vno, bill.RMK),
        status: 'posted',
        _party: norm(partyName)
      });
      continue;
    }

    if (WORK_DESP.has(code)) {
      workDespatches.push({
        userId,
        companyName,
        transactionType: name,
        partyName,
        ...sharedParty,
        challanNo: billNo,
        despatchDate: when,
        vehicleNo: text(bill.vehicle_NO, 40) || null,
        hsnCode: text(bill.BILLS_HSN_CODE, 20) || '5407',
        remarks: tag(code, vno, bill.RMK),
        lrNo: text(bill.RRNO, 40) || null,
        ewayBillNo: text(bill.EWB_NO, 40) || null,
        srNo: vno || null,
        lineItems: lines,
        totalPcs: round(num(bill.TOTPCS) || lines.reduce((sum, line) => sum + line.pcs, 0)),
        totalMts: round(num(bill.TOTMTS) || lines.reduce((sum, line) => sum + line.mtsQty, 0)),
        totalAmount: amounts.net,
        status: 'posted'
      });
      continue;
    }

    if (WORK_REC.has(code)) {
      workReceipts.push({
        userId,
        companyName,
        transactionType: name,
        partyName,
        ...sharedParty,
        challanNo: text(bill.CHALLAN, 40) || null,
        voucherNo: vno || null,
        receiptDate: when,
        vehicleNo: text(bill.vehicle_NO, 40) || null,
        hsnCode: text(bill.BILLS_HSN_CODE, 20) || '9988',
        remarks: tag(code, vno, bill.RMK),
        billNo,
        lineItems: lines,
        totalPcs: round(num(bill.TOTPCS)),
        totalMts: round(num(bill.TOTMTS)),
        grossAmount: amounts.gross,
        taxableAmount: amounts.taxable,
        gstRate: gst.gstRate,
        cgstRate: gst.cgstRate,
        cgstAmount: gst.cgstAmount,
        sgstRate: gst.sgstRate,
        sgstAmount: gst.sgstAmount,
        igstRate: gst.igstRate,
        igstAmount: gst.igstAmount,
        invoiceValue: amounts.net,
        tdsPercent: num(bill.TDSRATE),
        tdsAmount: round(num(bill.TDSAMT)),
        netAfterTds: amounts.net,
        status: 'posted'
      });
      continue;
    }

    if (NOTE[code]) {
      const [noteKind, noteSide] = NOTE[code];
      const customer = customerByName.get(norm(partyName));
      const supplier = supplierByName.get(norm(partyName));
      notes.push({
        userId,
        noteKind,
        noteSide,
        companyName,
        voucherNumber: vno || null,
        noteNumber: billNo,
        noteDate: when,
        partyType: customer ? 'customer' : 'supplier',
        partyName,
        customerId: customer?.id || null,
        supplierId: supplier?.id || null,
        placeOfSupply: party?.state || null,
        pieces: round(num(bill.TOTPCS)),
        quantity: round(num(bill.TOTMTS)),
        grossAmount: amounts.gross,
        taxableAmount: amounts.taxable,
        hsnSac: text(bill.BILLS_HSN_CODE, 20) || null,
        gstRate: gst.gstRate,
        cgstRate: gst.cgstRate,
        cgstAmount: gst.cgstAmount,
        sgstRate: gst.sgstRate,
        sgstAmount: gst.sgstAmount,
        igstRate: gst.igstRate,
        igstAmount: gst.igstAmount,
        totalTaxAmount: gst.totalTax,
        netAmount: amounts.net,
        netAmountAfterTds: amounts.net,
        remarks: tag(code, vno, bill.RMK),
        status: 'posted'
      });
      continue;
    }

    if (BANK_BILL.has(code)) {
      const customer = customerByName.get(norm(partyName));
      bankFromBills.push({
        userId,
        entryType: customer || party?.debtor ? 'receipt' : 'payment',
        transactionType: name,
        entryDate: when,
        voucherNumber: String(vno || billNo),
        companyName,
        partyType: customer ? 'customer' : 'supplier',
        partyName,
        amount: amounts.net || amounts.taxable,
        paymentMode: 'bank',
        billNumber: billNo,
        remarks: tag(code, vno, bill.RMK)
      });
      continue;
    }

    const supplier = supplierByName.get(norm(partyName));
    purchases.push({
      userId,
      supplierId: supplier?.id,
      billNumber: billNo,
      billDate: when,
      voucherNumber: String(vno || ''),
      lineItems: lines,
      taxableAmount: amounts.taxable,
      discountAmount: round(num(bill.discamt) || num(bill.billdis)),
      cgstAmount: gst.cgstAmount,
      sgstAmount: gst.sgstAmount,
      igstAmount: gst.igstAmount,
      totalTaxAmount: gst.totalTax,
      grandTotal: amounts.net,
      transactionType: name,
      typeBillNumber: vno || null,
      companyName,
      partyGstin: party?.gst || null,
      station: text(bill.PLACE, 80) || null,
      transportName: text(bill.TRANSPORT, 80) || null,
      lrNo: text(bill.RRNO, 40) || null,
      vehicleNo: text(bill.vehicle_NO, 40) || null,
      dhara: num(bill.PAYDAYS) || null,
      grace: num(bill.GRACEDAYS) || null,
      remarks: tag(code, vno, [bill.RMK, num(bill.TDSAMT) ? `TDS ${round(num(bill.TDSAMT))}` : ''].filter(Boolean).join(' ')),
      challanNo: text(bill.CHALLAN, 40) || null,
      supplierBillNo: billNo,
      purchaseAccount: name,
      status: 'posted',
      _party: partyName
    });
    otherBills.push(code);
  }

  const missingSupplierNames = [...new Set(purchases.filter(row => !row.supplierId).map(row => row._party))];
  if (missingSupplierNames.length) {
    await prisma.supplier.createMany({
      data: missingSupplierNames.map(name => ({
        userId,
        name,
        accountType: 'OTHER',
        remark: 'Created so a purchase voucher could be saved'
      }))
    });
    const extra = await prisma.supplier.findMany({
      where: { userId, name: { in: missingSupplierNames } },
      select: { id: true, name: true }
    });
    for (const row of extra) supplierByName.set(norm(row.name), row);
    for (const row of purchases) {
      if (!row.supplierId) row.supplierId = supplierByName.get(norm(row._party))?.id;
    }
  }
  const purchaseData = purchases.filter(row => row.supplierId).map(({ _party, ...row }) => row);

  console.log(`Writing vouchers: sales ${orders.length}, purchases ${purchaseData.length}, grey ${greyPurchases.length}, work out ${workDespatches.length}, work in ${workReceipts.length}, notes ${notes.length}, unadjusted ${bankFromBills.length}`);
  await batches(orders, 40, (rows) => prisma.order.createMany({ data: rows }));
  await batches(salesOrders, 40, (rows) => prisma.salesOrder.createMany({ data: rows }));
  await batches(purchaseData, 40, (rows) => prisma.purchaseBill.createMany({ data: rows }));
  await batches(greyPurchases, 40, (rows) => prisma.greyPurchase.createMany({ data: rows }));
  await batches(workDespatches, 40, (rows) => prisma.workDespatch.createMany({ data: rows }));
  await batches(workReceipts, 40, (rows) => prisma.workReceipt.createMany({ data: rows }));
  await batches(notes, 50, (rows) => prisma.creditDebitNote.createMany({ data: rows }));
  await batches(bankFromBills, 100, (rows) => prisma.bankEntry.createMany({ data: rows }));

  const savedGrey = await prisma.greyPurchase.findMany({
    where: { userId },
    select: { id: true, partyName: true, billNo: true, netAmount: true }
  });
  const greyByParty = new Map();
  for (const row of savedGrey) {
    const key = norm(row.partyName);
    const list = greyByParty.get(key) || [];
    list.push(row);
    greyByParty.set(key, list);
  }

  async function purchaseFor(partyName, billHint) {
    const key = norm(partyName);
    const list = greyByParty.get(key) || [];
    const hinted = billHint ? list.find(row => text(row.billNo, 40) === text(billHint, 40)) : null;
    if (hinted) return hinted.id;
    const withValue = list.find(row => num(row.netAmount) > 0) || list[0];
    if (withValue) return withValue.id;
    const supplier = supplierByName.get(key);
    const created = await prisma.greyPurchase.create({
      data: {
        userId,
        supplierId: supplier?.id || null,
        companyName,
        partyName: text(partyName, 180) || 'UNSPECIFIED',
        billDate: new Date('2018-04-01T12:00:00+05:30'),
        billNo: text(billHint, 40) || null,
        transactionType: 'GREY PURCHASE',
        lineItems: [{ itemName: 'Grey', description: 'Grey', pcs: 0, amount: 0 }],
        netAmount: 0,
        remarks: 'Opened so a mill dispatch or grey return from Empire could be kept',
        status: 'posted'
      },
      select: { id: true, partyName: true, billNo: true, netAmount: true }
    });
    const bucket = greyByParty.get(key) || [];
    bucket.push(created);
    greyByParty.set(key, bucket);
    return created.id;
  }

  console.log(`Linking ${greyReturns.length} grey returns...`);
  const returnData = [];
  for (const row of greyReturns) {
    const { _party, ...data } = row;
    data.greyPurchaseId = await purchaseFor(row.partyName, null);
    returnData.push(data);
  }
  await batches(returnData, 40, (rows) => prisma.greyPurchaseReturn.createMany({ data: rows }));

  console.log(`Writing ${pinv.length} mill dispatches...`);
  const dispatchByCard = new Map();
  const dispatchByNo = new Map();
  for (const row of pinv) {
    const weaver = text(row.WEAVER, 180) || 'UNSPECIFIED';
    const mill = text(row.MILL, 180) || 'MILL';
    const card = text(row.CARDNO, 40);
    const despNo = text(row.DESPNO, 40);
    const greyPurchaseId = await purchaseFor(weaver, row.WCHAL);
    const saved = await prisma.greyDispatch.create({
      data: {
        userId,
        greyPurchaseId,
        companyName,
        transactionType: 'MILL DESP. CHALLAN',
        challanNo: despNo || card || null,
        dispatchDate: parseDate(row.DDATE || row.WCHDAT),
        millLotNo: text(row.LOT, 40) || null,
        millName: mill,
        purBillNo: text(row.WCHAL, 40) || null,
        purDate: row.WCHDAT ? parseDate(row.WCHDAT) : null,
        weaverName: weaver,
        quality: text(row.QUAL, 160) || null,
        rate: num(row.RATE),
        despTaka: num(row.WPCS),
        despMts: num(row.WMTS),
        takaDetails: card && takaByCard.get(card) ? takaByCard.get(card) : undefined,
        remark: tag('PINV', row.VNO || card, row.DRMK),
        brokerName: text(row.BROKER_CODE, 80) || null,
        vehicleNo: text(row.vehicle_NO, 40) || null,
        ewayBillNo: text(row.EWB_NO, 40) || null,
        srNo: int(row.VNO) || null,
        status: 'posted'
      },
      select: { id: true, millName: true, quality: true, greyPurchaseId: true }
    });
    if (card) dispatchByCard.set(card, saved);
    if (despNo) dispatchByNo.set(despNo, saved);
  }

  console.log(`Writing ${millrec.length} mill receipts...`);
  for (const row of millrec) {
    const card = text(row.CARDNO, 40);
    const despNo = text(row.DESPNO, 40);
    let dispatch = (card && dispatchByCard.get(card)) || (despNo && dispatchByNo.get(despNo));
    if (!dispatch) {
      const mill = text(row.MILL_CODE, 180) || 'MILL';
      const greyPurchaseId = await purchaseFor(mill, despNo);
      dispatch = await prisma.greyDispatch.create({
        data: {
          userId,
          greyPurchaseId,
          companyName,
          transactionType: 'MILL DESP. CHALLAN',
          challanNo: despNo || card || null,
          dispatchDate: parseDate(row.chaldate || row.CUTDATE),
          millName: mill,
          quality: text(row.GREYQUAL, 160) || null,
          despMts: num(row.WMTS),
          despTaka: num(row.WPCS),
          remark: 'Opened so a mill receipt from Empire could be kept',
          status: 'posted'
        },
        select: { id: true, millName: true, quality: true, greyPurchaseId: true }
      });
    }
    const metres = num(row.RMTS);
    const rate = num(row.JOBRATE);
    const jobAmount = round(metres * rate);
    await prisma.millReceipt.create({
      data: {
        userId,
        greyDispatchId: dispatch.id,
        greyPurchaseId: dispatch.greyPurchaseId,
        companyName,
        millName: text(row.MILL_CODE, 180) || dispatch.millName,
        entryType: 'JOB WORK',
        voucherNo: int(row.VNO) || null,
        receiptDate: parseDate(row.CUTDATE || row.chaldate),
        billNo: text(row.chalno, 40) || null,
        lotNo: text(row.lot || row.DESPNO || row.CARDNO, 40) || 'NA',
        despNo: despNo || null,
        recChallan: text(row.chalno, 40) || null,
        quality: text(row.GREYQUAL, 160) || dispatch.quality || null,
        printStyle: text(row.PRINT_STYLE, 80) || null,
        recTaka: num(row.RPCS),
        recMts: metres,
        greyMts: num(row.WMTS),
        jobRate: rate,
        jobAmount,
        taxableAmount: jobAmount,
        invoiceValue: jobAmount,
        netAfterTds: jobAmount,
        remarks: tag('MILL', row.VNO || card, row.RECRMK),
        takaDetails: card && takaByCard.get(card) ? takaByCard.get(card) : undefined,
        status: 'posted'
      }
    });
  }

  console.log(`Writing ${cutdet.length} cutting cards...`);
  const cards = cutdet.map(row => ({
    userId,
    companyName,
    cutCardNo: text(row.CUTCARDNO || row.CARDNO, 40) || `CARD-${text(row.DESPNO, 20) || 'NA'}`,
    recCardNo: text(row.reccardno, 40) || null,
    entryDate: parseDate(row.CUTDATE || row.RDATE),
    millName: text(row.MILL, 180) || null,
    lotNo: text(row.lot, 40) || null,
    weaverName: text(row.WEAVER, 180) || null,
    quality: text(row.GREYQUAL || row.DESIGNNO, 160) || null,
    greyMts: num(row.WMTS || row.RMTS),
    greyRate: num(row.RATE),
    greyAmount: round(num(row.WMTS || row.RMTS) * num(row.RATE)),
    finMts: num(row.CMTS),
    jobRate: num(row.JOBRATE),
    jobAmount: round(num(row.CMTS) * num(row.JOBRATE)),
    freshSarees: num(row.CPCS),
    secondSarees: num(row.SECONDS),
    actCut: num(row.CCUT),
    status: 'posted'
  }));
  await batches(cards, 40, (rows) => prisma.cuttingCard.createMany({ data: rows }));

  console.log('Writing bank, cash, journal, opening and TDS vouchers...');
  const fasGroups = new Map();
  for (const row of fas) {
    const code = text(row.TYPE, 12);
    const key = `${code}|${int(row.VNO)}`;
    const list = fasGroups.get(key) || [];
    list.push(row);
    fasGroups.set(key, list);
  }
  const bankEntries = [];
  const journals = [];
  let skippedFas = 0;
  for (const [key, rows] of fasGroups) {
    const code = key.split('|')[0];
    const vno = key.split('|')[1];
    const when = parseDate(rows.find(row => row.DATE)?.DATE);
    const name = seriesName(code, seriesNames, empireSeries);
    if (FAS_BANK.has(code)) {
      const bankLine = rows.find(row => {
        const account = parties.get(norm(row.code));
        const typeName = account?.accountType || '';
        return /BANK|CASH/i.test(typeName) || /BANK|CASH/i.test(row.code);
      }) || rows[0];
      const partiesLines = rows.filter(row => row !== bankLine);
      const targets = partiesLines.length ? partiesLines : rows;
      for (const line of targets) {
        const amount = round(Math.max(num(line.DRAMT), num(line.CRAMT)));
        if (amount <= 0) continue;
        const account = parties.get(norm(line.code));
        const customer = customerByName.get(norm(line.code));
        bankEntries.push({
          userId,
          entryType: code === 'B1' || code === 'C1' ? 'receipt' : 'payment',
          transactionType: name,
          entryDate: when,
          voucherNumber: String(vno),
          companyName,
          bankName: text(bankLine.code, 120) || null,
          accountName: text(bankLine.code, 120) || null,
          partyType: customer || account?.debtor ? 'customer' : 'supplier',
          partyName: text(line.code, 180) || 'UNSPECIFIED',
          amount,
          paymentMode: code.startsWith('C') ? 'cash' : 'bank',
          billNumber: text(line.BILLNO || line.DOCNO, 40) || null,
          billAllocations: allocByVoucher.get(`${code}|${int(vno)}`) || undefined,
          remarks: tag(code, vno, line.RMK)
        });
      }
      continue;
    }
    if (billTypes.has(code)) {
      skippedFas += rows.length;
      continue;
    }
    const debits = rows.filter(row => num(row.DRAMT) > 0);
    const credits = rows.filter(row => num(row.CRAMT) > 0);
    const amount = round(debits.reduce((sum, row) => sum + num(row.DRAMT), 0)
      || credits.reduce((sum, row) => sum + num(row.CRAMT), 0));
    if (amount <= 0) continue;
    const partyLine = debits[0] || credits[0] || rows[0];
    const oppositeLine = (credits.find(row => row !== partyLine) || debits.find(row => row !== partyLine) || rows.find(row => row !== partyLine));
    const partyName = text(partyLine.code, 180) || 'UNSPECIFIED';
    const customer = customerByName.get(norm(partyName));
    journals.push({
      userId,
      transactionType: name,
      typeBillNumber: int(vno) || null,
      voucherNumber: String(vno),
      voucherDate: when,
      companyName,
      partyType: customer ? 'customer' : 'supplier',
      partyName,
      customerId: customer?.id || null,
      supplierId: supplierByName.get(norm(partyName))?.id || null,
      oppositeAccount: text(oppositeLine?.code, 180) || 'SUSPENSE',
      partySide: debits.length ? 'debit' : 'credit',
      amount,
      narration: rows.map(row => `${text(row.code, 60)} Dr ${round(num(row.DRAMT))} Cr ${round(num(row.CRAMT))} ${text(row.RMK, 80)}`).join(' | ').slice(0, 4000),
      remarks: tag(code, vno, rows[0]?.RMK),
      status: 'posted'
    });
  }
  await batches(bankEntries, 100, (rows) => prisma.bankEntry.createMany({ data: rows }));
  await batches(journals, 80, (rows) => prisma.journalVoucher.createMany({ data: rows }));

  const counts = {
    customers: await prisma.customer.count({ where: { userId } }),
    suppliers: await prisma.supplier.count({ where: { userId } }),
    qualities: await prisma.salesItemMaster.count({ where: { userId } }),
    sales: await prisma.order.count({ where: { userId, manualType: 'erp_sales' } }),
    purchases: await prisma.purchaseBill.count({ where: { userId } }),
    greyPurchases: await prisma.greyPurchase.count({ where: { userId } }),
    greyReturns: await prisma.greyPurchaseReturn.count({ where: { userId } }),
    dispatches: await prisma.greyDispatch.count({ where: { userId } }),
    millReceipts: await prisma.millReceipt.count({ where: { userId } }),
    cuttingCards: await prisma.cuttingCard.count({ where: { userId } }),
    workDespatches: await prisma.workDespatch.count({ where: { userId } }),
    workReceipts: await prisma.workReceipt.count({ where: { userId } }),
    notes: await prisma.creditDebitNote.count({ where: { userId } }),
    bank: await prisma.bankEntry.count({ where: { userId } }),
    journals: await prisma.journalVoucher.count({ where: { userId } }),
    skippedLedgerRows: skippedFas,
    purchaseSeries: [...new Set(otherBills)].sort()
  };
  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
