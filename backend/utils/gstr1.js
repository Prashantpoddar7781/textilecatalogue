import { roundMoney } from './orderBilling.js';
import { GST_STANDARD_RATES, loadGstDocuments, posLabel } from './gstDocuments.js';

/**
 * B2CL: invoice to an unregistered buyer in another state above this value.
 * ₹2,50,000 up to July 2024 (what Empire's help box still says); ₹1,00,000 for
 * invoices dated 1 Aug 2024 onwards (Notification 12/2024-CT).
 */
const B2CL_LIMITS = [
  { from: '2024-08-01', limit: 100000 },
  { from: '0000-01-01', limit: 250000 }
];

export function b2clLimitFor(dateKey) {
  const found = B2CL_LIMITS.find(row => String(dateKey || '') >= row.from);
  return found ? found.limit : 250000;
}

const DOC_NATURE_ORDER = [
  'Invoices for outward supply',
  'Invoices for inward supply from unregistered person',
  'Revised Invoice',
  'Debit Note',
  'Credit Note',
  'Receipt Voucher',
  'Payment Voucher',
  'Refund Voucher',
  'Delivery Challan for job work',
  'Delivery Challan for supply on approval',
  'Delivery Challan in case of liquid gas',
  'Delivery Challan in case other than by way of supply (excluding at S no. 9 to 11)'
];

const docRef = (doc) => ({
  id: doc.id,
  source: doc.source,
  editPath: doc.editPath,
  docNo: doc.docNo,
  date: doc.date,
  partyName: doc.partyName,
  transactionType: doc.transactionType,
  taxable: roundMoney(doc.taxable * doc.sign),
  tax: roundMoney(doc.tax * doc.sign),
  invoiceValue: roundMoney(doc.invoiceValue * doc.sign)
});

/** Lines of one document collapsed by GST rate, as GSTR-1 wants one row per rate. */
function byRate(doc) {
  const map = new Map();
  for (const line of doc.lines) {
    const rate = Number(line.rate) || 0;
    const cur = map.get(rate) || { rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
    cur.taxable = roundMoney(cur.taxable + line.taxable);
    cur.igst = roundMoney(cur.igst + line.igst);
    cur.cgst = roundMoney(cur.cgst + line.cgst);
    cur.sgst = roundMoney(cur.sgst + line.sgst);
    map.set(rate, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
}

function addTotals(target, row) {
  target.taxable = roundMoney(target.taxable + (row.taxable || 0));
  target.igst = roundMoney(target.igst + (row.igst || 0));
  target.cgst = roundMoney(target.cgst + (row.cgst || 0));
  target.sgst = roundMoney(target.sgst + (row.sgst || 0));
  target.cess = 0;
}

const emptyTotals = () => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });

function pushProblem(problems, doc, issue, severity = 'error') {
  problems.push({
    severity,
    issue,
    id: doc.id,
    source: doc.source,
    editPath: doc.editPath,
    docNo: doc.docNo,
    date: doc.date,
    partyName: doc.partyName,
    partyGstin: doc.partyGstin,
    transactionType: doc.transactionType,
    direction: doc.direction
  });
}

/**
 * Data-entry checks Empire runs before GSTR-1 / GSTR-3B ("LIST OF INVALID GSTINs",
 * "LIST OF DATA ENTRY PROBLEMS"). Each problem points at the voucher to fix.
 */
export function gstDataProblems(docs, businessCode) {
  const problems = [];
  for (const doc of docs) {
    if (doc.cancelled) continue;
    if (!doc.docNo && doc.direction !== 'inward') {
      pushProblem(problems, doc, 'Document number is blank. GSTR-1 Table 13 needs a serial number.');
    }
    if (doc.direction === 'challan') continue;
    if (doc.direction === 'outward' && Math.abs(doc.taxable) < 0.005 && Math.abs(doc.tax) < 0.005) {
      pushProblem(problems, doc, 'Document has zero taxable value and zero tax. It is left out of B2B / B2C / HSN.', 'warning');
    }
    if (doc.partyGstin && !doc.gstinValid) {
      pushProblem(problems, doc, `GSTIN ${doc.partyGstin} is not a valid GSTIN (wrong length, format or check digit).`);
    } else if (doc.partyGstin && doc.posCode && doc.direction === 'outward' && doc.partyGstin.slice(0, 2) !== doc.posCode) {
      pushProblem(problems, doc, `Place of supply ${posLabel(doc.posCode)} differs from the GSTIN state ${posLabel(doc.partyGstin.slice(0, 2))}.`, 'warning');
    }
    if (doc.direction === 'inward' && doc.tax > 0.001 && !doc.partyGstin) {
      pushProblem(problems, doc, 'GST charged but the supplier has no GSTIN in the master. ITC cannot be matched.');
    }
    if (doc.direction === 'outward' && !doc.posCode) {
      pushProblem(problems, doc, 'Place of supply is unknown. Put the state in the party master.');
    }
    if (doc.direction === 'outward' && doc.docNo.length > 16) {
      pushProblem(problems, doc, `Document number "${doc.docNo}" is longer than the 16 characters GSTR-1 allows.`);
    }
    if (doc.direction === 'outward' && businessCode && doc.posCode) {
      const sameState = doc.posCode === businessCode;
      if (sameState && doc.igst > 0.001) {
        pushProblem(problems, doc, 'IGST charged on a supply inside the state. It should be CGST + SGST.');
      }
      if (!sameState && (doc.cgst > 0.001 || doc.sgst > 0.001)) {
        pushProblem(problems, doc, `CGST + SGST charged on a supply to ${posLabel(doc.posCode)}. An inter-state supply takes IGST.`);
      }
    }
    for (const line of doc.lines) {
      const rate = Number(line.rate) || 0;
      if (!GST_STANDARD_RATES.includes(rate)) {
        pushProblem(problems, doc, `GST rate ${rate}% is not a rate the GST portal accepts.`);
      }
      if (doc.direction === 'outward' && line.taxable !== 0) {
        const hsn = String(line.hsn || '').replace(/\D/g, '');
        if (!hsn) pushProblem(problems, doc, 'HSN code is blank on a bill line.');
        else if (hsn.length < 4) pushProblem(problems, doc, `HSN ${hsn} has fewer than 4 digits.`, 'warning');
      }
      const expected = roundMoney(line.taxable * rate / 100);
      const charged = roundMoney(line.igst + line.cgst + line.sgst);
      if (rate > 0 && Math.abs(expected - charged) > 1) {
        pushProblem(problems, doc, `Tax ${charged.toFixed(2)} does not equal ${rate}% of taxable ${line.taxable.toFixed(2)} (${expected.toFixed(2)}).`, 'warning');
      }
    }
  }
  return problems;
}

/** Documents issued (Table 13 / docs sheet): one row per nature + series. */
function documentsIssued(docs) {
  const groups = new Map();
  for (const doc of docs) {
    if (!['outward', 'challan'].includes(doc.direction)) continue;
    const nature = doc.docType;
    if (!DOC_NATURE_ORDER.includes(nature)) continue;
    const key = `${nature}|${doc.transactionType}`;
    const cur = groups.get(key) || {
      nature,
      transactionType: doc.transactionType,
      items: []
    };
    cur.items.push(doc);
    groups.set(key, cur);
  }
  const rows = [];
  for (const group of groups.values()) {
    const num = (doc) => (doc.counter == null || doc.counter === '' ? NaN : Number(doc.counter));
    const sorted = [...group.items].sort((a, b) => {
      const ca = num(a);
      const cb = num(b);
      if (Number.isFinite(ca) && Number.isFinite(cb) && ca !== cb) return ca - cb;
      if (Number.isFinite(ca) !== Number.isFinite(cb)) return Number.isFinite(ca) ? -1 : 1;
      return String(a.docNo).localeCompare(String(b.docNo));
    });
    const numbered = sorted.filter(doc => doc.docNo);
    rows.push({
      nature: group.nature,
      transactionType: group.transactionType,
      fromNo: numbered[0]?.docNo || '',
      toNo: numbered[numbered.length - 1]?.docNo || '',
      totalNumber: sorted.length,
      cancelled: sorted.filter(doc => doc.cancelled).length,
      docs: sorted.map(docRef)
    });
  }
  rows.sort((a, b) => {
    const na = DOC_NATURE_ORDER.indexOf(a.nature);
    const nb = DOC_NATURE_ORDER.indexOf(b.nature);
    if (na !== nb) return na - nb;
    return a.transactionType.localeCompare(b.transactionType);
  });
  return rows;
}

function addHsn(map, doc, sign) {
  for (const line of doc.lines) {
    if (Math.abs(line.taxable) < 0.005 && Math.abs(line.igst + line.cgst + line.sgst) < 0.005) continue;
    const hsn = String(line.hsn || '').replace(/\s/g, '') || '—';
    const rate = Number(line.rate) || 0;
    const uqc = line.uqc || 'UNT-UNITS';
    const key = `${hsn}|${uqc}|${rate}`;
    const cur = map.get(key) || {
      hsn,
      description: `${uqc.split('-')[0]}-${rate}`,
      uqc,
      rate,
      qty: 0,
      totalValue: 0,
      taxable: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      cess: 0,
      docs: []
    };
    cur.qty = roundMoney(cur.qty + (Number(line.qty) || 0) * sign);
    cur.taxable = roundMoney(cur.taxable + line.taxable * sign);
    cur.igst = roundMoney(cur.igst + line.igst * sign);
    cur.cgst = roundMoney(cur.cgst + line.cgst * sign);
    cur.sgst = roundMoney(cur.sgst + line.sgst * sign);
    cur.totalValue = roundMoney(cur.taxable + cur.igst + cur.cgst + cur.sgst);
    if (!cur.docs.some(ref => ref.id === doc.id)) cur.docs.push(docRef(doc));
    map.set(key, cur);
  }
}

const sortHsn = (rows) => rows.sort((a, b) => (a.hsn === b.hsn
  ? (a.uqc === b.uqc ? a.rate - b.rate : a.uqc.localeCompare(b.uqc))
  : a.hsn.localeCompare(b.hsn)));

/**
 * GSTR-1 for the window. Sections follow the GST offline-tool workbook
 * (b2b, b2cl, b2cs, cdnr, cdnur, exemp, hsn(b2b), hsn(b2c), docs).
 */
export async function buildGstr1(prisma, userId, range) {
  const loaded = await loadGstDocuments(prisma, userId, range, { includeChallans: true, includeCancelled: true });
  const { businessCode } = loaded;
  const live = loaded.docs.filter(doc => !doc.cancelled);
  const outward = live.filter(doc => doc.direction === 'outward');

  const b2b = [];
  const b2cl = [];
  const b2csMap = new Map();
  const cdnr = [];
  const cdnur = [];
  const exemp = {
    'Inter-State supplies to registered persons': 0,
    'Intra-State supplies to registered persons': 0,
    'Inter-State supplies to unregistered persons': 0,
    'Intra-State supplies to unregistered persons': 0
  };
  const exempDocs = new Map(Object.keys(exemp).map(key => [key, []]));
  const hsnB2b = new Map();
  const hsnB2c = new Map();

  const addB2cs = (doc, rateRow, sign) => {
    const pos = doc.pos || posLabel(businessCode);
    const key = `${pos}|${rateRow.rate}`;
    const cur = b2csMap.get(key) || {
      type: 'OE',
      pos,
      rate: rateRow.rate,
      taxable: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      cess: 0,
      ecommerceGstin: '',
      docs: []
    };
    cur.taxable = roundMoney(cur.taxable + rateRow.taxable * sign);
    cur.igst = roundMoney(cur.igst + rateRow.igst * sign);
    cur.cgst = roundMoney(cur.cgst + rateRow.cgst * sign);
    cur.sgst = roundMoney(cur.sgst + rateRow.sgst * sign);
    if (!cur.docs.some(ref => ref.id === doc.id)) cur.docs.push(docRef(doc));
    b2csMap.set(key, cur);
  };

  const addExemp = (doc, rateRow, sign) => {
    const key = `${doc.interState ? 'Inter' : 'Intra'}-State supplies to ${doc.registered ? 'registered' : 'unregistered'} persons`;
    exemp[key] = roundMoney(exemp[key] + rateRow.taxable * sign);
    const list = exempDocs.get(key);
    if (!list.some(ref => ref.id === doc.id)) list.push(docRef(doc));
  };

  for (const doc of outward) {
    const rates = byRate(doc);
    const taxedRates = rates.filter(row => row.rate > 0);
    const nilRates = rates.filter(row => row.rate === 0);
    const isNote = doc.kind === 'credit' || doc.kind === 'debit';
    const sign = doc.sign;

    for (const row of nilRates) addExemp(doc, row, sign);
    addHsn(doc.registered ? hsnB2b : hsnB2c, doc, sign);

    if (!isNote) {
      if (doc.registered) {
        for (const row of taxedRates) {
          b2b.push({
            ...docRef(doc),
            gstin: doc.partyGstin,
            receiverName: doc.partyName,
            invoiceNo: doc.docNo,
            invoiceDate: doc.date,
            invoiceValue: doc.invoiceValue,
            pos: doc.pos,
            reverseCharge: 'N',
            applicablePercent: '',
            invoiceType: 'Regular B2B',
            ecommerceGstin: '',
            rate: row.rate,
            taxable: row.taxable,
            igst: row.igst,
            cgst: row.cgst,
            sgst: row.sgst,
            cess: 0
          });
        }
      } else if (doc.interState && doc.invoiceValue > b2clLimitFor(doc.date)) {
        for (const row of taxedRates) {
          b2cl.push({
            ...docRef(doc),
            invoiceNo: doc.docNo,
            invoiceDate: doc.date,
            invoiceValue: doc.invoiceValue,
            pos: doc.pos,
            applicablePercent: '',
            rate: row.rate,
            taxable: row.taxable,
            igst: row.igst,
            cess: 0,
            ecommerceGstin: ''
          });
        }
      } else {
        for (const row of taxedRates) addB2cs(doc, row, 1);
      }
      continue;
    }

    const noteType = doc.kind === 'credit' ? 'C' : 'D';
    if (doc.registered) {
      for (const row of taxedRates) {
        cdnr.push({
          ...docRef(doc),
          gstin: doc.partyGstin,
          receiverName: doc.partyName,
          noteNo: doc.docNo,
          noteDate: doc.date,
          noteType,
          pos: doc.pos,
          reverseCharge: 'N',
          noteSupplyType: 'Regular B2B',
          noteValue: doc.invoiceValue,
          applicablePercent: '',
          rate: row.rate,
          taxable: row.taxable,
          igst: row.igst,
          cgst: row.cgst,
          sgst: row.sgst,
          cess: 0
        });
      }
    } else if (doc.interState && doc.invoiceValue > b2clLimitFor(doc.date)) {
      for (const row of taxedRates) {
        cdnur.push({
          ...docRef(doc),
          urType: 'B2CL',
          noteNo: doc.docNo,
          noteDate: doc.date,
          noteType,
          pos: doc.pos,
          noteValue: doc.invoiceValue,
          applicablePercent: '',
          rate: row.rate,
          taxable: row.taxable,
          igst: row.igst,
          cess: 0
        });
      }
    } else {
      // Notes on B2C sales are netted into B2CS for the same state and rate.
      for (const row of taxedRates) addB2cs(doc, row, sign);
    }
  }

  const b2cs = Array.from(b2csMap.values())
    .filter(row => Math.abs(row.taxable) > 0.001)
    .sort((a, b) => (a.pos === b.pos ? a.rate - b.rate : a.pos.localeCompare(b.pos)));
  const exempRows = Object.entries(exemp).map(([description, nilRated]) => ({
    description,
    nilRated,
    exempted: 0,
    nonGst: 0,
    docs: exempDocs.get(description)
  }));
  const docsIssued = documentsIssued(loaded.docs);

  const sectionTotal = (rows, invoiceField) => {
    const totals = emptyTotals();
    rows.forEach(row => addTotals(totals, row));
    const ids = new Set(rows.flatMap(row => (row.docs ? row.docs.map(ref => ref.id) : [row.id])).filter(Boolean));
    const value = invoiceField
      ? roundMoney(Array.from(new Map(rows.map(row => [row.id, row[invoiceField]])).values()).reduce((s, v) => s + (Number(v) || 0), 0))
      : roundMoney(totals.taxable + totals.igst + totals.cgst + totals.sgst);
    return { ...totals, documents: ids.size, value };
  };

  const hsnB2bRows = sortHsn(Array.from(hsnB2b.values()));
  const hsnB2cRows = sortHsn(Array.from(hsnB2c.values()));

  const summary = [
    { section: 'b2b', label: '4A, 4B, 6B, 6C - B2B Invoices', ...sectionTotal(b2b, 'invoiceValue'), recipients: new Set(b2b.map(r => r.gstin)).size },
    { section: 'b2cl', label: '5A, 5B - B2C (Large) Invoices', ...sectionTotal(b2cl, 'invoiceValue') },
    { section: 'b2cs', label: '7 - B2C (Others)', ...sectionTotal(b2cs) },
    { section: 'cdnr', label: '9B - Credit / Debit Notes (Registered)', ...sectionTotal(cdnr, 'noteValue'), recipients: new Set(cdnr.map(r => r.gstin)).size },
    { section: 'cdnur', label: '9B - Credit / Debit Notes (Unregistered)', ...sectionTotal(cdnur, 'noteValue') },
    {
      section: 'exemp',
      label: '8A - 8D - Nil Rated Supplies',
      taxable: roundMoney(exempRows.reduce((s, r) => s + r.nilRated, 0)),
      igst: 0,
      cgst: 0,
      sgst: 0,
      cess: 0,
      documents: new Set(exempRows.flatMap(r => r.docs.map(d => d.id))).size,
      value: roundMoney(exempRows.reduce((s, r) => s + r.nilRated, 0))
    },
    { section: 'hsnB2b', label: '12 - HSN-wise summary (B2B)', ...sectionTotal(hsnB2bRows) },
    { section: 'hsnB2c', label: '12 - HSN-wise summary (B2C)', ...sectionTotal(hsnB2cRows) },
    {
      section: 'docs',
      label: '13 - Documents Issued',
      taxable: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      cess: 0,
      documents: docsIssued.reduce((s, r) => s + r.totalNumber, 0),
      cancelled: docsIssued.reduce((s, r) => s + r.cancelled, 0),
      value: 0
    }
  ];

  const liability = emptyTotals();
  for (const doc of outward) {
    addTotals(liability, {
      taxable: doc.taxable * doc.sign,
      igst: doc.igst * doc.sign,
      cgst: doc.cgst * doc.sign,
      sgst: doc.sgst * doc.sign
    });
  }

  return {
    period: range.period || '',
    fromDate: range.fromDate || '',
    toDate: range.toDate || '',
    company: {
      name: loaded.companyName,
      gstin: loaded.gstin,
      stateCode: businessCode,
      state: posLabel(businessCode)
    },
    b2clLimit: b2clLimitFor(range.toDate || range.fromDate || ''),
    summary,
    liability: { ...liability, tax: roundMoney(liability.igst + liability.cgst + liability.sgst) },
    b2b,
    b2cl,
    b2cs,
    cdnr,
    cdnur,
    exemp: exempRows,
    hsnB2b: hsnB2bRows,
    hsnB2c: hsnB2cRows,
    docs: docsIssued,
    problems: gstDataProblems(live.filter(doc => doc.direction !== 'inward'), businessCode)
  };
}
