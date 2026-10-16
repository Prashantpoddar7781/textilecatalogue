import ExcelJS from 'exceljs';
import { roundMoney } from './orderBilling.js';
import { dateKey, loadGstDocuments, normalizeGstin, posLabel } from './gstDocuments.js';

/**
 * GSTR-2A / 2B matching. The CA downloads 2B (or 2A) from the portal and sends
 * it; we read it into one row per supplier document and match it against the
 * inward vouchers in the books.
 */

export const MATCH_STATUS = {
  MATCHED: 'MATCHED',
  MISMATCH: 'MISMATCH',
  GST_BLANK: 'GST BLANK',
  ABSENT_IN_2A: 'ABSENT IN 2A',
  ABSENT_IN_BOOKS: 'ABSENT IN YOUR A/C',
  NO_PARTY_MASTER: 'ABSENT IN YOUR A/C - NO PARTY MASTER'
};

export const MATCH_STATUS_HELP = {
  [MATCH_STATUS.MATCHED]: 'Bill is in the books and on the portal with the same bill no. and amount.',
  [MATCH_STATUS.MISMATCH]: 'Bill found on both sides but the bill number or the amount does not match.',
  [MATCH_STATUS.GST_BLANK]: 'Party\'s GST number is not in the master, so the bill cannot be matched.',
  [MATCH_STATUS.ABSENT_IN_2A]: 'Bill is in the books but the supplier has not filed it (not on the portal).',
  [MATCH_STATUS.ABSENT_IN_BOOKS]: 'Bill is on the portal but the bill entry is not done in the books.',
  [MATCH_STATUS.NO_PARTY_MASTER]: 'Bill is on the portal and the party\'s account does not exist in the master.'
};

const AMOUNT_TOLERANCE = 1;

const text = (value) => String(value == null ? '' : value).trim();
const num = (value) => {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  const parsed = Number(String(value).replace(/[₹,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

/** Portal dates come as Date, Excel serial, dd-mm-yyyy, dd/mm/yyyy or dd-Mon-yy. */
export function parsePortalDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) return dateKey(value);
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    return dateKey(new Date(Date.UTC(1899, 11, 30) + value * 86400000));
  }
  const raw = text(value);
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  match = raw.match(/^(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*[-\s/](\d{2,4})$/);
  if (match && MONTHS[match[2].toUpperCase()]) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${String(MONTHS[match[2].toUpperCase()]).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  return '';
}

/** Bill numbers compared without spaces, slashes, dashes, case and leading zeros. */
export function normalizeBillNo(value) {
  return text(value).toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^0+(?=\d)/, '');
}

function digitCore(value) {
  const digits = text(value).replace(/\D/g, '').replace(/^0+/, '');
  return digits;
}

function noteKindOf(value) {
  const raw = text(value).toUpperCase();
  if (raw.startsWith('D')) return 'debit';
  return 'credit';
}

function emptyPortalRow(seed) {
  return {
    gstin: normalizeGstin(seed.gstin),
    name: text(seed.name),
    kind: seed.kind || 'invoice',
    docNo: text(seed.docNo),
    date: seed.date || '',
    value: roundMoney(num(seed.value)),
    pos: text(seed.pos),
    reverseCharge: /^(Y|YES)$/i.test(text(seed.reverseCharge)),
    taxable: 0,
    igst: 0,
    cgst: 0,
    sgst: 0,
    cess: 0,
    period: text(seed.period),
    filingDate: seed.filingDate || '',
    itcAvailable: text(seed.itcAvailable),
    reason: text(seed.reason)
  };
}

function addPortalAmounts(target, amounts) {
  target.taxable = roundMoney(target.taxable + num(amounts.taxable));
  target.igst = roundMoney(target.igst + num(amounts.igst));
  target.cgst = roundMoney(target.cgst + num(amounts.cgst));
  target.sgst = roundMoney(target.sgst + num(amounts.sgst));
  target.cess = roundMoney(target.cess + num(amounts.cess));
}

/** One row per supplier document; the portal repeats a bill once per tax rate. */
function collapse(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row.gstin || !row.docNo) continue;
    const key = `${row.gstin}|${row.kind}|${normalizeBillNo(row.docNo)}`;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { ...row });
      continue;
    }
    addPortalAmounts(cur, row);
    if (!cur.value && row.value) cur.value = row.value;
  }
  return Array.from(map.values()).map((row, index) => ({
    ...row,
    key: `p${index + 1}`,
    tax: roundMoney(row.igst + row.cgst + row.sgst)
  }));
}

/* ----------------------------- JSON (portal) ----------------------------- */

function parsePortalJson(payload) {
  const root = payload?.data?.docdata || payload?.docdata || payload?.data || payload;
  const rows = [];
  const items = (list) => (Array.isArray(list) ? list : []);

  const pushItems = (seed, itemList) => {
    const row = emptyPortalRow(seed);
    for (const item of items(itemList)) {
      const det = item.itm_det || item;
      addPortalAmounts(row, {
        taxable: det.txval,
        igst: det.igst ?? det.iamt,
        cgst: det.cgst ?? det.camt,
        sgst: det.sgst ?? det.samt,
        cess: det.cess ?? det.csamt
      });
    }
    if (!items(itemList).length) {
      addPortalAmounts(row, { taxable: seed.txval, igst: seed.igst, cgst: seed.cgst, sgst: seed.sgst, cess: seed.cess });
    }
    rows.push(row);
  };

  for (const supplier of items(root?.b2b)) {
    for (const inv of items(supplier.inv)) {
      pushItems({
        gstin: supplier.ctin,
        name: supplier.trdnm,
        kind: 'invoice',
        docNo: inv.inum,
        date: parsePortalDate(inv.dt || inv.idt),
        value: inv.val,
        pos: inv.pos,
        reverseCharge: inv.rev || inv.rchrg,
        period: supplier.supprd || supplier.fldtr1 || '',
        itcAvailable: inv.itcavl,
        reason: inv.rsn,
        txval: inv.txval,
        igst: inv.igst,
        cgst: inv.cgst,
        sgst: inv.sgst,
        cess: inv.cess
      }, inv.items || inv.itms);
    }
  }
  for (const supplier of [...items(root?.cdnr), ...items(root?.cdn)]) {
    for (const note of items(supplier.nt)) {
      pushItems({
        gstin: supplier.ctin,
        name: supplier.trdnm,
        kind: noteKindOf(note.typ || note.ntty),
        docNo: note.ntnum || note.nt_num,
        date: parsePortalDate(note.dt || note.nt_dt),
        value: note.val,
        pos: note.pos,
        reverseCharge: note.rev || note.rchrg,
        period: supplier.supprd || '',
        itcAvailable: note.itcavl,
        reason: note.rsn,
        txval: note.txval,
        igst: note.igst,
        cgst: note.cgst,
        sgst: note.sgst,
        cess: note.cess
      }, note.items || note.itms);
    }
  }
  return rows;
}

/* --------------------------- Excel / CSV tables --------------------------- */

const COLUMN_RULES = [
  ['gstin', /gstin/i],
  ['name', /trade|legal|supplier name|party name|name of supplier/i],
  ['docType', /(note|invoice|document)\s*type|type of note/i],
  ['docNo', /(invoice|note|document|bill)\s*(number|no)/i],
  ['date', /(invoice|note|document|bill)\s*date|^date$/i],
  ['value', /(invoice|note|document|bill)\s*value|total value|invoice amount|bill amount/i],
  ['pos', /place of supply|^pos$/i],
  ['reverseCharge', /reverse/i],
  ['taxable', /taxable/i],
  ['igst', /integrated|igst/i],
  ['cgst', /central|cgst/i],
  ['sgst', /state\s*\/?\s*ut\s*tax|state tax|sgst|utgst/i],
  ['cess', /cess/i],
  ['period', /period/i],
  ['filingDate', /filing date/i],
  ['itcAvailable', /itc avail/i],
  ['reason', /reason/i]
];

function mapColumns(labels) {
  const map = {};
  labels.forEach((label, index) => {
    if (!label) return;
    // Amendment sheets carry "Original Details" and "Revised Details"; the revised side is what 2B counts.
    if (/^original details/i.test(label)) {
      if (map.originalDocNo == null && /number|no\b/i.test(label)) map.originalDocNo = index;
      if (map.originalDate == null && /date/i.test(label)) map.originalDate = index;
      return;
    }
    for (const [field, pattern] of COLUMN_RULES) {
      if (map[field] != null) continue;
      if (field === 'sgst' && /place of supply/i.test(label)) continue;
      if (field === 'gstin' && /e-?commerce|ecom/i.test(label)) continue;
      if (field === 'date' && /filing/i.test(label)) continue;
      if (field === 'value' && /taxable/i.test(label)) continue;
      if (pattern.test(label)) {
        map[field] = index;
        break;
      }
    }
  });
  return map;
}

const looksLikeGstin = (value) => /^[0-9]{2}[A-Z0-9]{13}$/.test(normalizeGstin(value));

/**
 * Turn a 2-D grid (one sheet) into portal rows. The portal Excel has a 2-row
 * header ("Invoice details" over "Invoice number"…), so the header is the row
 * that mentions GSTIN plus any following rows until the first GSTIN value.
 */
function rowsFromGrid(grid, sheetKind) {
  const headerIndex = grid.findIndex((cells, index) => index < 15
    && cells.some(cell => /gstin/i.test(text(cell)))
    && cells.some(cell => /taxable|invoice|note|bill/i.test(text(cell))));
  if (headerIndex < 0) return [];

  const width = Math.max(...grid.slice(Math.max(0, headerIndex - 1), headerIndex + 3).map(cells => cells.length));
  const above = headerIndex > 0 ? grid[headerIndex - 1] : [];
  const amendment = above.some(cell => /original details/i.test(text(cell)));
  const labels = Array.from({ length: width }, (_, col) => {
    const head = text(grid[headerIndex][col]);
    return amendment ? `${text(above[col])} ${head}`.trim() : head;
  });
  let dataStart = headerIndex + 1;
  const gstinCol = labels.findIndex(label => /gstin/i.test(label) && !/e-?commerce/i.test(label));
  while (dataStart < grid.length && dataStart < headerIndex + 3 && !looksLikeGstin(grid[dataStart][gstinCol])) {
    for (let col = 0; col < width; col += 1) {
      const sub = text(grid[dataStart][col]);
      if (sub && sub !== labels[col]) labels[col] = `${labels[col]} ${sub}`.trim();
    }
    dataStart += 1;
  }
  const cols = mapColumns(labels);
  if (cols.gstin == null || cols.docNo == null) return [];

  const get = (cells, field) => (cols[field] == null ? '' : cells[cols[field]]);
  const rows = [];
  for (const cells of grid.slice(dataStart)) {
    const gstin = normalizeGstin(get(cells, 'gstin'));
    if (!looksLikeGstin(gstin)) continue;
    const typeText = text(get(cells, 'docType'));
    let kind = sheetKind;
    if (sheetKind === 'note' || /credit|debit/i.test(typeText)) {
      kind = /debit/i.test(typeText) ? 'debit' : 'credit';
    }
    if (kind === 'note') kind = 'credit';
    const row = emptyPortalRow({
      gstin,
      name: get(cells, 'name'),
      kind,
      docNo: get(cells, 'docNo'),
      date: parsePortalDate(get(cells, 'date')),
      value: get(cells, 'value'),
      pos: get(cells, 'pos'),
      reverseCharge: get(cells, 'reverseCharge'),
      period: get(cells, 'period'),
      filingDate: parsePortalDate(get(cells, 'filingDate')),
      itcAvailable: get(cells, 'itcAvailable'),
      reason: get(cells, 'reason')
    });
    if (amendment) {
      row.amended = true;
      row.originalDocNo = text(get(cells, 'originalDocNo'));
      row.originalDate = parsePortalDate(get(cells, 'originalDate'));
    }
    addPortalAmounts(row, {
      taxable: get(cells, 'taxable'),
      igst: get(cells, 'igst'),
      cgst: get(cells, 'cgst'),
      sgst: get(cells, 'sgst'),
      cess: get(cells, 'cess')
    });
    rows.push(row);
  }
  return rows;
}

function cellValue(cell) {
  const value = cell?.value;
  if (value == null) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (value.richText) return value.richText.map(part => part.text).join('');
    if (value.result != null) return value.result;
    if (value.text != null) return value.text;
    return '';
  }
  return value;
}

function sheetKindOf(name) {
  const lower = name.toLowerCase().replace(/\s+/g, '');
  // Rejected / ITC-reversal sheets are not ITC available; ISD, imports and ECO are not supplier B2B bills.
  if (/rejected|reversal|b2b-dnr|isd|impg|imps|summary|readme|help|eco|itcavailable|itcnotavailable/.test(lower)) return null;
  if (/cdn/.test(lower)) return 'note';
  if (/b2b/.test(lower)) return 'invoice';
  return 'any';
}

async function parseExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = workbook.worksheets.map(sheet => ({ sheet, kind: sheetKindOf(sheet.name) }));
  const named = sheets.filter(entry => entry.kind === 'invoice' || entry.kind === 'note');
  const use = named.length ? named : sheets.filter(entry => entry.kind === 'any');
  const rows = [];
  for (const { sheet, kind } of use) {
    const grid = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => { cells[colNumber - 1] = cellValue(cell); });
      grid[rowNumber - 1] = cells;
    });
    for (let i = 0; i < grid.length; i += 1) if (!grid[i]) grid[i] = [];
    rows.push(...rowsFromGrid(grid, kind === 'any' ? 'invoice' : kind));
  }
  return rows;
}

function parseCsv(content) {
  const grid = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) { grid.push([]); continue; }
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (ch === '"') quoted = false; else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',' || ch === '\t') { cells.push(cur); cur = ''; } else cur += ch;
    }
    cells.push(cur);
    grid.push(cells);
  }
  return rowsFromGrid(grid, 'invoice');
}

/** Parse the CA's file (portal 2B/2A Excel or JSON, or a plain CSV). */
export async function parsePortalStatement(fileName, buffer) {
  const name = text(fileName).toLowerCase();
  let rows;
  if (name.endsWith('.json')) {
    rows = parsePortalJson(JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, '')));
  } else if (name.endsWith('.csv') || name.endsWith('.txt')) {
    rows = parseCsv(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  } else if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    rows = await parseExcel(buffer);
  } else {
    throw Object.assign(new Error('Upload the GSTR-2B / 2A file as .xlsx, .json or .csv (old .xls: open in Excel and save as .xlsx).'), { status: 400 });
  }
  const collapsed = collapse(rows);
  if (!collapsed.length) {
    throw Object.assign(new Error('No supplier bills found. The file needs columns for GSTIN of supplier, invoice/note number, taxable value and tax.'), { status: 400 });
  }
  return collapsed;
}

/* -------------------------------- Matching -------------------------------- */

const bookClass = (doc) => (doc.kind === 'inward_credit' || doc.kind === 'inward_debit' ? 'note' : 'invoice');
const portalClass = (row) => (row.kind === 'credit' ? 'note' : 'invoice');

/** Mill bills are saved one row per dispatch; join them back into the one bill. */
function bookEntries(docs) {
  const map = new Map();
  for (const doc of docs) {
    if (doc.direction !== 'inward' || doc.cancelled) continue;
    const key = doc.groupKey || doc.id;
    const cur = map.get(key);
    const ref = { id: doc.id, editPath: doc.editPath, docNo: doc.docNo, date: doc.date, source: doc.source };
    if (!cur) {
      map.set(key, {
        key,
        ids: [doc.id],
        refs: [ref],
        editPath: doc.editPath,
        source: doc.source,
        transactionType: doc.transactionType,
        itc: doc.itc,
        cls: bookClass(doc),
        date: doc.date,
        voucherNo: doc.docNo,
        billNo: doc.partyBillNo || doc.docNo,
        partyName: doc.partyName,
        gstin: doc.partyGstin,
        taxable: doc.taxable,
        igst: doc.igst,
        cgst: doc.cgst,
        sgst: doc.sgst,
        tax: doc.tax,
        value: doc.invoiceValue
      });
      continue;
    }
    cur.ids.push(doc.id);
    cur.refs.push(ref);
    cur.taxable = roundMoney(cur.taxable + doc.taxable);
    cur.igst = roundMoney(cur.igst + doc.igst);
    cur.cgst = roundMoney(cur.cgst + doc.cgst);
    cur.sgst = roundMoney(cur.sgst + doc.sgst);
    cur.tax = roundMoney(cur.tax + doc.tax);
    cur.value = roundMoney(cur.value + doc.invoiceValue);
  }
  return Array.from(map.values()).filter(entry => Math.abs(entry.tax) > 0.001);
}

const amountsAgree = (book, portal) => Math.abs(book.taxable - portal.taxable) <= AMOUNT_TOLERANCE
  && Math.abs(book.tax - portal.tax) <= AMOUNT_TOLERANCE;

/** Pair book entries with portal rows of the same GSTIN: bill no., then digits, then amount. */
function pairUp(books, portals) {
  const pairs = [];
  const freeBooks = new Set(books);
  const freePortals = new Set(portals);
  const portalNos = (p) => [p.docNo, p.originalDocNo].filter(Boolean);
  const passes = [
    (b, p) => normalizeBillNo(b.billNo) && portalNos(p).some(no => normalizeBillNo(no) === normalizeBillNo(b.billNo)),
    (b, p) => digitCore(b.billNo) && portalNos(p).some(no => digitCore(no) === digitCore(b.billNo)),
    (b, p) => amountsAgree(b, p)
  ];
  passes.forEach((test, pass) => {
    for (const book of Array.from(freeBooks)) {
      const candidates = Array.from(freePortals).filter(p => portalClass(p) === book.cls && test(book, p));
      if (!candidates.length) continue;
      candidates.sort((a, b) => Math.abs(Date.parse(a.date || 0) - Date.parse(book.date || 0))
        - Math.abs(Date.parse(b.date || 0) - Date.parse(book.date || 0)));
      const portal = candidates[0];
      freeBooks.delete(book);
      freePortals.delete(portal);
      pairs.push({ book, portal, byBillNo: pass < 2 });
    }
  });
  return { pairs, books: Array.from(freeBooks), portals: Array.from(freePortals) };
}

function bookSide(entry) {
  if (!entry) return null;
  return {
    voucherNo: entry.voucherNo,
    billNo: entry.billNo,
    date: entry.date,
    transactionType: entry.transactionType,
    taxable: entry.taxable,
    igst: entry.igst,
    cgst: entry.cgst,
    sgst: entry.sgst,
    tax: entry.tax,
    value: entry.value,
    refs: entry.refs
  };
}

function portalSide(row) {
  if (!row) return null;
  return {
    docNo: row.docNo,
    kind: row.kind,
    date: row.date,
    taxable: row.taxable,
    igst: row.igst,
    cgst: row.cgst,
    sgst: row.sgst,
    tax: row.tax,
    value: row.value,
    pos: row.pos ? (posLabel(row.pos) || row.pos) : '',
    period: row.period,
    itcAvailable: row.itcAvailable,
    reason: row.reason,
    amended: Boolean(row.amended),
    originalDocNo: row.originalDocNo || ''
  };
}

function resultRow(status, remark, { book = null, portal = null, partyName = '', gstin = '' }) {
  const taxableDiff = book && portal ? roundMoney(book.taxable - portal.taxable) : 0;
  const taxDiff = book && portal ? roundMoney(book.tax - portal.tax) : 0;
  const notes = [remark];
  if (portal?.amended) {
    notes.push(`Amended on portal${portal.originalDocNo ? ` (original bill ${portal.originalDocNo}${portal.originalDate ? ` of ${portal.originalDate}` : ''})` : ''}.`);
  }
  if (portal && /^n/i.test(portal.itcAvailable || '')) {
    notes.push(`Portal says ITC not available${portal.reason ? ` (${portal.reason})` : ''}.`);
  }
  return {
    status,
    remark: notes.filter(Boolean).join(' '),
    gstin: gstin || book?.gstin || portal?.gstin || '',
    partyName: partyName || book?.partyName || portal?.name || '',
    editPath: book?.editPath || '',
    book: bookSide(book),
    portal: portalSide(portal),
    taxableDiff,
    taxDiff
  };
}

/** 1 April of the financial year that contains the date. */
export function financialYearStart(dateKeyValue) {
  const [year, month] = String(dateKeyValue).split('-').map(Number);
  return `${month >= 4 ? year : year - 1}-04-01`;
}

/** Book entries that an earlier month's 2B/2A already reconciled. */
function reconciledEarlier(books, earlierStatements) {
  const done = new Set();
  const earlierRows = earlierStatements.flatMap(s => (Array.isArray(s.rows) ? s.rows : []));
  const gstins = new Set(earlierRows.map(row => row.gstin));
  for (const gstin of gstins) {
    const result = pairUp(books.filter(b => b.gstin === gstin), earlierRows.filter(row => row.gstin === gstin));
    for (const { book } of result.pairs) done.add(book.key);
  }
  return done;
}

/**
 * Match the books against the uploaded 2B/2A rows, like Empire's reconciliation
 * (bill date from 1 April to the month end): bills of the month plus older bills of
 * the financial year that no earlier month's statement reconciled. A portal bill
 * booked outside that window (late filing, previous year) is MATCHED with the book date.
 */
export async function buildGstr2bMatch(prisma, userId, range, statement, earlierStatements = []) {
  const all = await loadGstDocuments(prisma, userId, {});
  const entries = bookEntries(all.docs);
  const fyStart = financialYearStart(range.fromDate);
  const inMonth = (entry) => entry.date >= range.fromDate && entry.date <= range.toDate;
  const earlierInYear = entries.filter(entry => entry.date >= fyStart && entry.date < range.fromDate);
  const alreadyDone = reconciledEarlier(earlierInYear, earlierStatements);
  const carried = new Set(earlierInYear.filter(entry => !alreadyDone.has(entry.key)).map(entry => entry.key));
  const monthBooks = entries.filter(entry => inMonth(entry) || carried.has(entry.key));
  const otherBooks = entries.filter(entry => !inMonth(entry) && !carried.has(entry.key));
  const portalRows = Array.isArray(statement?.rows) ? statement.rows : [];
  const carriedNote = (book) => (carried.has(book.key) ? ` Bill of ${book.date.slice(0, 7)} carried forward (not reconciled earlier).` : '');

  const masterGstins = new Set([
    ...all.parties.suppliers.map(row => normalizeGstin(row.gstNumber)),
    ...all.parties.customers.map(row => normalizeGstin(row.gstNumber)),
    ...entries.map(entry => entry.gstin)
  ].filter(Boolean));

  const rows = [];
  const reconciledIds = [];

  // Older GST-blank bills were already listed in their own month; repeat only this month's.
  for (const book of monthBooks.filter(entry => !entry.gstin && inMonth(entry))) {
    rows.push(resultRow(MATCH_STATUS.GST_BLANK, 'Add the GSTIN in the party master, then match again.', { book }));
  }

  const gstins = new Set([
    ...monthBooks.filter(entry => entry.gstin).map(entry => entry.gstin),
    ...portalRows.map(row => row.gstin)
  ]);

  for (const gstin of gstins) {
    const books = monthBooks.filter(entry => entry.gstin === gstin);
    const portals = portalRows.filter(row => row.gstin === gstin);
    const result = pairUp(books, portals);

    for (const { book, portal, byBillNo } of result.pairs) {
      const amountOk = amountsAgree(book, portal);
      if (byBillNo && amountOk) {
        rows.push(resultRow(MATCH_STATUS.MATCHED, carriedNote(book).trim(), { book, portal }));
        reconciledIds.push(...book.ids);
      } else if (byBillNo) {
        rows.push(resultRow(MATCH_STATUS.MISMATCH,
          `Amount differs: taxable ${roundMoney(book.taxable - portal.taxable).toFixed(2)}, tax ${roundMoney(book.tax - portal.tax).toFixed(2)} (books − portal).${carriedNote(book)}`,
          { book, portal }));
      } else {
        rows.push(resultRow(MATCH_STATUS.MISMATCH,
          `Bill no. differs: books "${book.billNo}", portal "${portal.docNo}". Amounts agree.${carriedNote(book)}`,
          { book, portal }));
      }
    }

    for (const book of result.books) {
      rows.push(resultRow(MATCH_STATUS.ABSENT_IN_2A, `Supplier has not uploaded this bill. Follow up before claiming ITC.${carriedNote(book)}`, { book }));
    }

    const elsewhere = otherBooks.filter(entry => entry.gstin === gstin);
    const late = pairUp(elsewhere, result.portals);
    for (const { book, portal, byBillNo } of late.pairs) {
      const ok = byBillNo && amountsAgree(book, portal);
      rows.push(resultRow(ok ? MATCH_STATUS.MATCHED : MATCH_STATUS.MISMATCH,
        `Booked in another month (${book.date}).${ok ? '' : ' Bill no. or amount also differs.'}`,
        { book, portal }));
    }
    for (const portal of late.portals) {
      if (masterGstins.has(gstin)) {
        rows.push(resultRow(MATCH_STATUS.ABSENT_IN_BOOKS, 'Enter this purchase bill in the books.', { portal }));
      } else {
        rows.push(resultRow(MATCH_STATUS.NO_PARTY_MASTER, 'Create the party account with this GSTIN, then enter the bill.', { portal }));
      }
    }
  }

  const order = Object.values(MATCH_STATUS);
  rows.sort((a, b) => {
    const sa = order.indexOf(a.status);
    const sb = order.indexOf(b.status);
    if (sa !== sb) return sa - sb;
    if (a.partyName !== b.partyName) return a.partyName.localeCompare(b.partyName);
    return String(a.book?.date || a.portal?.date || '').localeCompare(String(b.book?.date || b.portal?.date || ''));
  });

  const summary = order.map(status => {
    const list = rows.filter(row => row.status === status);
    return {
      status,
      help: MATCH_STATUS_HELP[status],
      count: list.length,
      bookTax: roundMoney(list.reduce((s, row) => s + (row.book?.tax || 0), 0)),
      portalTax: roundMoney(list.reduce((s, row) => s + (row.portal?.tax || 0), 0))
    };
  });

  const portalTotal = portalRows.reduce((acc, row) => {
    const sign = row.kind === 'credit' ? -1 : 1;
    acc.taxable = roundMoney(acc.taxable + row.taxable * sign);
    acc.igst = roundMoney(acc.igst + row.igst * sign);
    acc.cgst = roundMoney(acc.cgst + row.cgst * sign);
    acc.sgst = roundMoney(acc.sgst + row.sgst * sign);
    return acc;
  }, { taxable: 0, igst: 0, cgst: 0, sgst: 0 });

  return {
    period: range.period || '',
    fromDate: range.fromDate || '',
    toDate: range.toDate || '',
    statement: statement
      ? { id: statement.id, source: statement.source, fileName: statement.fileName, rowCount: statement.rowCount, createdAt: statement.createdAt }
      : null,
    portalTotal: { ...portalTotal, tax: roundMoney(portalTotal.igst + portalTotal.cgst + portalTotal.sgst) },
    summary,
    rows,
    reconciledIds
  };
}
