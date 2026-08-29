/**
 * Regenerates the Transaction Types posting-rule constants from the Empire export.
 *
 *   node backend/scripts/generateTransactionPostingRules.mjs
 *
 * Source of truth: backend/constants/data/transactionTypes.tsv (exported from
 * Empire's "TRANSACTION TYPES" grid). Re-export and re-run this each year rather
 * than hand-editing the generated files.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const tsvPath = path.join(repoRoot, 'backend', 'constants', 'data', 'transactionTypes.tsv');
const tsOut = path.join(repoRoot, 'constants', 'erpTransactionPostingRules.ts');
const jsOut = path.join(repoRoot, 'backend', 'constants', 'erpTransactionPostingRules.js');

/** Excel column header -> generated field name. Order defines the object key order. */
const COLUMNS = [
  ['SERIES NAME', 'series', 'string'],
  ['SERIES CODE', 'seriesCode', 'string'],
  ['BILLING ALLOWED', 'billingAllowed', 'bool'],
  ['SINGLE REF A/C', 'singleRef', 'bool'],
  ['GST DOCUMENT TYPE', 'gstDocumentType', 'string'],
  ['GST -> ALPHABET ADD (SUFFIX) IN BILL/NOTE NO.', 'billSuffix', 'string'],
  ['BILLING FORM NAME', 'billingForm', 'string'],
  ['BILLING SALE/PUR A/C', 'saleOrPurchaseAccount', 'string'],
  ['BILLING A/C TYPE', 'partyAccountType', 'string'],
  ['STOCK TYPE', 'stockType', 'string'],
  ['NO. SERIES', 'numberSeries', 'string'],
  ['PREVIOUS LINK', 'previousLink', 'string'],
  ['NEXT LINK', 'nextLink', 'string'],
  ['DISCOUNT JVS', 'discountJvs', 'bool'],
  ['0 GRACE FOR INTEREST CALCULATION', 'zeroGraceForInterest', 'bool'],
  ['DISC. A/C', 'discountAccount', 'string'],
  ['DESIGN NOS. ENTRY', 'designNosEntry', 'bool'],
  ['TDS %', 'tdsPercent', 'number'],
  ['TDS A/C', 'tdsAccount', 'string'],
  ['STOCK EFFECT', 'stockEffect', 'numberOrNull'],
  ['COMPULSORY LINK', 'compulsoryLink', 'bool'],
  ['SHOW ALL ENTRIES IN PICK', 'showAllEntriesInPick', 'bool'],
  ['ALL COMPANIES DATA IN PICK', 'allCompaniesDataInPick', 'bool'],
  ['COPY ITEM DETAILS ALSO AFTER REF NO. (PICK) ENTRY', 'copyItemDetailsAfterRef', 'bool'],
  ['WARN ON MANUAL ENTRY OF V NO.', 'warnOnManualEntry', 'bool'],
  ['GST -> SINGLE GST RATE FOR ALL ITEMS IN BILL', 'singleGstRateForBill', 'bool'],
  ['GST -> DEFAULT HSN/SAC CODE', 'defaultHsnCode', 'string'],
  ['GST -> ELIGIBILITY FOR INPUT TAX CREDIT (PURCHASES)', 'itcEligibility', 'string'],
  ['CGST %', 'cgstPercent', 'number'],
  ['SGST %', 'sgstPercent', 'number'],
  ['GST A/C', 'gstAccount', 'string'],
  ['OLD VAT A/C', 'oldVatAccount', 'string'],
  ['STAGE GROUP', 'stageGroup', 'string'],
  ['MAIN STAGE/LINK', 'mainStageLink', 'string'],
  ['FINAL STAGE OF JOB CARD', 'finalStageOfJobCard', 'bool'],
  ['INCLUDE COSTING OF STAGE', 'includeCostingOfStage', 'bool'],
  ['SCAN PATH', 'scanPath', 'string'],
  ['TCS A/C', 'tcsAccount', 'string']
];

/**
 * Series that only exist because one firm asked for them, and carry that firm's name.
 *
 * They stay in the master so any voucher already saved against them still resolves
 * its posting rule and keeps its link, but they are excluded from the general pick
 * lists — a new customer should never see another firm's name in a dropdown.
 */
const COMPANY_SPECIFIC_SERIES = new Set([
  'WORK DESP POONAM CHALLAN',
  'WORK DESP POONAM LACE CHALLAN',
  'WORK REC. POONAM BILLS',
  'WORK REC. POONAM LACE BILLS'
]);

/**
 * Series our app posts that Empire's master does not define. Kept here (not in the
 * TSV) so a re-export never silently drops them.
 */
const LOCAL_EXTENSIONS = [
  {
    series: 'MILL REC.CHALLAN',
    seriesCode: 'O3',
    billingAllowed: true,
    singleRef: true,
    gstDocumentType: 'Inward Invoices (All Purchases)',
    billingForm: 'CHALLAN',
    partyAccountType: 'CREDITORS FOR DYEING JOB CHARG',
    stockType: 'GREY',
    defaultHsnCode: '9988',
    itcEligibility: 'Input Services',
    cgstPercent: 2.5,
    sgstPercent: 2.5,
    gstAccount: 'GST PAYABLE A/C',
    warnOnManualEntry: true
  }
];

function parseTsv(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  const header = lines[0].split('\t').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = line.split('\t');
    const row = {};
    header.forEach((name, i) => {
      row[name] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

/** Access exports True as -1 or 1; blank and 0 are false. */
function toBool(raw) {
  const n = Number(raw);
  if (Number.isFinite(n)) return n !== 0;
  return false;
}

function toNumber(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function toNumberOrNull(raw) {
  if (raw === '' || raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(raw) {
  const v = String(raw ?? '').trim();
  return v === '' ? null : v;
}

/** Serialized key order: every Excel column, then our own derived flags. */
const FIELD_ORDER = [...COLUMNS.map(([, field]) => field), 'companySpecific'];

function buildRule(row) {
  const rule = {};
  for (const [header, field, kind] of COLUMNS) {
    const raw = row[header];
    if (kind === 'bool') rule[field] = toBool(raw);
    else if (kind === 'number') rule[field] = toNumber(raw);
    else if (kind === 'numberOrNull') rule[field] = toNumberOrNull(raw);
    else rule[field] = toStringOrNull(raw);
  }
  rule.companySpecific = COMPANY_SPECIFIC_SERIES.has(String(rule.series || '').toUpperCase());
  return rule;
}

function withExtensionDefaults(seed) {
  const rule = {};
  for (const [, field, kind] of COLUMNS) {
    if (kind === 'bool') rule[field] = false;
    else if (kind === 'number') rule[field] = 0;
    else rule[field] = null;
  }
  rule.companySpecific = false;
  return { ...rule, ...seed };
}

const rows = parseTsv(fs.readFileSync(tsvPath, 'utf8'));
const rules = rows.map(buildRule).filter(r => r.series);
const extensions = LOCAL_EXTENSIONS.map(withExtensionDefaults);
const all = [...rules, ...extensions];

const seen = new Map();
for (const rule of all) {
  const key = rule.series.toUpperCase();
  if (seen.has(key)) throw new Error(`Duplicate series in master: ${rule.series}`);
  seen.set(key, rule);
}

function distinct(field) {
  return Array.from(new Set(all.map(r => r[field]).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function unionType(values) {
  return values.map(v => `'${v.replace(/'/g, "\\'")}'`).join('\n  | ');
}

function literal(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function serializeRules(indent = '  ') {
  return all
    .map(rule => {
      const body = FIELD_ORDER.map(field => `${indent}  ${field}: ${literal(rule[field])}`).join(',\n');
      return `${indent}{\n${body}\n${indent}}`;
    })
    .join(',\n');
}

const GENERATED_BANNER = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: backend/constants/data/transactionTypes.tsv (Empire "TRANSACTION TYPES" export)
 * Regenerate: node backend/scripts/generateTransactionPostingRules.mjs
 *
 * One row per voucher series: its numbering series, GST document class and rates,
 * the nominal ledger it posts to, the party control account, the stock ledger it
 * moves, and the document-link chain (PREVIOUS LINK / NEXT LINK) that says which
 * document this one is raised against.
 */`;

const stockTypes = distinct('stockType');
const gstDocumentTypes = distinct('gstDocumentType');
const billingForms = distinct('billingForm');
const itcEligibilities = distinct('itcEligibility');

const tsFile = `${GENERATED_BANNER}

export type ErpStockType =
  | ${unionType(stockTypes)};

export type ErpGstDocumentType =
  | ${unionType(gstDocumentTypes)};

export type ErpBillingForm =
  | ${unionType(billingForms)};

export type ErpItcEligibility =
  | ${unionType(itcEligibilities)};

/** Which GST return the document feeds. Delivery challans carry no tax liability. */
export type ErpGstReturnSection = 'GSTR-1' | 'GSTR-2' | 'NONE';

/** STOCK TYPE + STOCK EFFECT after filling blanks the Excel left empty. */
export type ErpResolvedStockMovement = {
  stockType: ErpStockType | null;
  stockEffect: number | null;
  inferred: boolean;
};

export interface ErpPostingRule {
  /** SERIES NAME — matches the transaction type stored on the voucher. */
  series: string;
  /** SERIES CODE — numbering prefix (P7, S51, O5 …). */
  seriesCode: string;
  /** BILLING ALLOWED — series belongs to the billing system rather than general entries. */
  billingAllowed: boolean;
  /** SINGLE REF A/C — one party ledger per document. */
  singleRef: boolean;
  gstDocumentType: ErpGstDocumentType | null;
  /** GST → ALPHABET ADD (SUFFIX) IN BILL/NOTE NO. */
  billSuffix: string | null;
  billingForm: ErpBillingForm | null;
  /** BILLING SALE/PUR A/C — the nominal ledger this series posts to. */
  saleOrPurchaseAccount: string | null;
  /** BILLING A/C TYPE — party-side control account. */
  partyAccountType: string | null;
  stockType: ErpStockType | null;
  numberSeries: string | null;
  /** PREVIOUS LINK — the series this document is raised against. */
  previousLink: string | null;
  /** NEXT LINK — the series that consumes this document. */
  nextLink: string | null;
  discountJvs: boolean;
  zeroGraceForInterest: boolean;
  discountAccount: string | null;
  designNosEntry: boolean;
  tdsPercent: number;
  tdsAccount: string | null;
  /** +1 brings stock in, -1 sends it out, null leaves stock untouched. */
  stockEffect: number | null;
  /** COMPULSORY LINK — the document may only be raised by picking its previous link. */
  compulsoryLink: boolean;
  /** SHOW ALL ENTRIES IN PICK — list fully-consumed source documents too. */
  showAllEntriesInPick: boolean;
  allCompaniesDataInPick: boolean;
  /** COPY ITEM DETAILS ALSO AFTER REF NO. — pull the source document's lines across. */
  copyItemDetailsAfterRef: boolean;
  warnOnManualEntry: boolean;
  singleGstRateForBill: boolean;
  defaultHsnCode: string | null;
  itcEligibility: ErpItcEligibility | null;
  cgstPercent: number;
  sgstPercent: number;
  gstAccount: string | null;
  oldVatAccount: string | null;
  stageGroup: string | null;
  mainStageLink: string | null;
  finalStageOfJobCard: boolean;
  includeCostingOfStage: boolean;
  scanPath: string | null;
  tcsAccount: string | null;
  /**
   * True for series that exist only for one firm and carry its name. Kept so saved
   * vouchers still resolve, but never offered in a pick list.
   */
  companySpecific: boolean;
}

export const ERP_POSTING_RULES: ErpPostingRule[] = [
${serializeRules()}
];

${sharedHelpers({ typed: true })}
`;

const jsFile = `${GENERATED_BANNER}

export const ERP_POSTING_RULES = [
${serializeRules()}
];

${sharedHelpers({ typed: false })}
`;

function sharedHelpers({ typed }) {
  const s = typed ? ': string' : '';
  const optStr = typed ? '?: string | null' : '';
  const retStrNull = typed ? ': string | null' : '';
  const retBool = typed ? ': boolean' : '';
  const retNumNull = typed ? ': number | null' : '';
  const retMove = typed ? ': ErpResolvedStockMovement' : '';
  const ruleType = typed ? ': ErpPostingRule | undefined' : '';
  const mapType = typed ? '<string, ErpPostingRule>' : '';
  const strArr = typed ? ': string[]' : '';
  const setType = typed ? '<string>' : '';

  return `const RULE_BY_SERIES = new Map${mapType}(
  ERP_POSTING_RULES.map(row => [row.series.toUpperCase(), row])
);

/**
 * The general master: everything except series named after one particular firm.
 * Use this for dropdowns and pick lists; use ERP_POSTING_RULES when resolving the
 * rule for a voucher that is already saved.
 */
export const ERP_GENERAL_POSTING_RULES${typed ? ': ErpPostingRule[]' : ''} =
  ERP_POSTING_RULES.filter(row => !row.companySpecific);

/** True for a series that belongs to one firm only and should not be offered. */
export function isCompanySpecificSeries(transactionType${optStr})${retBool} {
  return getPostingRule(transactionType)?.companySpecific === true;
}

/** Filters a list of series names down to the ones any firm may use. */
export function generalSeriesOnly(seriesNames${typed ? ': string[]' : ''})${strArr} {
  return (seriesNames || []).filter(name => !isCompanySpecificSeries(name));
}

/** Screen names that are the same series as an Excel row. */
const SERIES_ALIASES${typed ? ': Record<string, string>' : ''} = {
  'WORK REC. BILL': 'WORK REC. BILLS'
};

export function getPostingRule(transactionType${optStr})${ruleType} {
  const upper = String(transactionType || '').trim().toUpperCase();
  if (!upper) return undefined;
  return RULE_BY_SERIES.get(SERIES_ALIASES[upper] || upper);
}

/** Party control account for this series, or the caller's fallback when the master is blank. */
export function postingPartyAccountType(
  transactionType${optStr},
  fallback${typed ? ': string | null = null' : ' = null'}
)${retStrNull} {
  return getPostingRule(transactionType)?.partyAccountType || fallback;
}

/** Nominal Sale/Pur ledger for this series. */
export function postingSaleOrPurchaseAccount(transactionType${optStr})${retStrNull} {
  return getPostingRule(transactionType)?.saleOrPurchaseAccount || null;
}

export function getGstDocumentType(transactionType${optStr})${typed ? ': ErpGstDocumentType | null' : ''} {
  return getPostingRule(transactionType)?.gstDocumentType || null;
}

export function getStockType(transactionType${optStr})${typed ? ': ErpStockType | null' : ''} {
  return getPostingRule(transactionType)?.stockType || null;
}

/** +1 brings stock in, -1 sends it out, null leaves stock untouched. */
export function getStockEffect(transactionType${optStr})${retNumNull} {
  const found = getPostingRule(transactionType);
  return found && found.stockEffect != null ? found.stockEffect : null;
}

/**
 * Direction when STOCK TYPE is set but STOCK EFFECT is blank in the master.
 * Purchases / receipts / opening / transfer / box come in; sales / despatch /
 * purchase returns go out; sales goods return comes back in.
 */
export function inferredStockEffect(series${optStr})${retNumNull} {
  const u = String(series || '').trim().toUpperCase();
  if (!u) return null;
  if (u.includes('SALES GOODS RETURN')) return 1;
  if (u.includes('PURCHASE RETURN')) return -1;
  if (u.includes('WORK DESP')) return -1;
  if (u.includes('WORK REC')) return 1;
  if (u.includes('SALES') || /\\bDESP/.test(u)) return -1;
  if (u.includes('PURCHASE') || u.includes('OPENING') || u.includes('TRANSFER') || u.includes('BOX')) return 1;
  return 1;
}

/**
 * Stock ledger movement for a voucher series.
 *
 * Prefer the Excel STOCK EFFECT when it is filled. When STOCK TYPE is set and
 * EFFECT is blank, infer the sign — except WORK REC. *BILLS, which are job-charge
 * invoices (the challan already moved WORK). Grey mill dispatch is not in the
 * master at all: PROCESS / REPROCESS are GREY out.
 */
export function resolveStockMovement(transactionType${optStr})${retMove} {
  const upper = String(transactionType || '').trim().toUpperCase();
  if (upper === 'PROCESS' || upper === 'REPROCESS' || upper === 'GREY DISPATCH') {
    return { stockType: 'GREY', stockEffect: -1, inferred: true };
  }
  if (upper === 'RETURN') {
    return { stockType: null, stockEffect: null, inferred: false };
  }

  const found = getPostingRule(upper);
  if (!found) {
    if (upper.startsWith('WORK DESP')) return { stockType: 'WORK', stockEffect: -1, inferred: true };
    if (upper.includes('WORK REC') && upper.includes('CHALLAN')) {
      return { stockType: 'WORK', stockEffect: 1, inferred: true };
    }
    return { stockType: null, stockEffect: null, inferred: false };
  }

  let stockType = found.stockType;
  if (!stockType && upper.startsWith('WORK DESP')) stockType = 'WORK';

  if (upper.includes('MILL REC')) {
    return { stockType, stockEffect: null, inferred: false };
  }

  if (stockType && found.stockEffect == null) {
    if (upper.includes('WORK REC') && upper.includes('BILL')) {
      return { stockType, stockEffect: null, inferred: false };
    }
    return { stockType, stockEffect: inferredStockEffect(found.series), inferred: true };
  }

  return { stockType, stockEffect: found.stockEffect != null ? found.stockEffect : null, inferred: false };
}

/** True when the series belongs to the billing system rather than general entries. */
export function isBillingSeries(transactionType${optStr})${retBool} {
  return getPostingRule(transactionType)?.billingAllowed === true;
}

/** True when the document carries a single party ledger. */
export function requiresSingleReference(transactionType${optStr})${retBool} {
  return getPostingRule(transactionType)?.singleRef === true;
}

/** PREVIOUS LINK — the series this document is raised against. */
export function getPreviousLink(transactionType${optStr})${retStrNull} {
  return getPostingRule(transactionType)?.previousLink || null;
}

/** NEXT LINK — the series that consumes this document. */
export function getNextLink(transactionType${optStr})${retStrNull} {
  return getPostingRule(transactionType)?.nextLink || null;
}

/**
 * Every series that can feed \`transactionType\`.
 *
 * The master states links from both ends and is not always symmetric: WORK REC.
 * SUIT BILLS names WORK DESP CHALLAN as its previous link, while WORK DESP.SUIT
 * CHALLAN names WORK REC. SUIT BILLS as its next link. Taking the union of both
 * directions honours every link the master declares.
 */
export function getSourceSeriesFor(transactionType${optStr})${strArr} {
  const upper = String(transactionType || '').trim().toUpperCase();
  if (!upper) return [];
  const sources = new Set${setType}();
  const own = getPostingRule(upper)${typed ? '?' : '?'}.previousLink;
  if (own) sources.add(own);
  for (const row of ERP_POSTING_RULES) {
    if (row.nextLink && row.nextLink.toUpperCase() === upper) sources.add(row.series);
  }
  return Array.from(sources);
}

/** Every series that can consume \`transactionType\`, i.e. the reverse of the above. */
export function getTargetSeriesFor(transactionType${optStr})${strArr} {
  const upper = String(transactionType || '').trim().toUpperCase();
  if (!upper) return [];
  const targets = new Set${setType}();
  const own = getPostingRule(upper)${typed ? '?' : '?'}.nextLink;
  if (own) targets.add(own);
  for (const row of ERP_POSTING_RULES) {
    if (row.previousLink && row.previousLink.toUpperCase() === upper) targets.add(row.series);
  }
  return Array.from(targets);
}

/** True when the series may only be raised by picking one of its source documents. */
export function requiresCompulsoryLink(transactionType${optStr})${retBool} {
  return getPostingRule(transactionType)?.compulsoryLink === true;
}

/** True when picking a source document should also copy its item lines across. */
export function copiesItemDetailsFromSource(transactionType${optStr})${retBool} {
  return getPostingRule(transactionType)?.copyItemDetailsAfterRef === true;
}

/** True when the picker should list fully-consumed source documents as well. */
export function showsAllEntriesInPick(transactionType${optStr})${retBool} {
  return getPostingRule(transactionType)?.showAllEntriesInPick === true;
}

/** True when typing this document's number by hand should raise a warning. */
export function warnsOnManualEntry(transactionType${optStr})${retBool} {
  return getPostingRule(transactionType)?.warnOnManualEntry === true;
}

/** Default GST rate for the series: CGST% + SGST% from the master. */
export function postingGstRate(transactionType${optStr})${typed ? ': number | null' : ''} {
  const found = getPostingRule(transactionType);
  if (!found) return null;
  const total = (Number(found.cgstPercent) || 0) + (Number(found.sgstPercent) || 0);
  return total > 0 ? total : null;
}

const GSTR1_DOCUMENTS = new Set${setType}([
  'Invoices for outward supply',
  'Credit Note',
  'Debit Note'
]);

const GSTR2_DOCUMENTS = new Set${setType}([
  'Inward Invoices (All Purchases)',
  'Invoices for inward supply from unregistered person',
  'Credit Note (inward)',
  'Debit Note (inward)'
]);

export function gstReturnSection(transactionType${optStr})${typed ? ': ErpGstReturnSection' : ''} {
  const doc = getGstDocumentType(transactionType);
  if (!doc) return 'NONE';
  if (GSTR1_DOCUMENTS.has(doc)) return 'GSTR-1';
  if (GSTR2_DOCUMENTS.has(doc)) return 'GSTR-2';
  return 'NONE';
}

/**
 * GSTR-3B Table 4 bucket for this series: Input Goods, Input Services, or Capital Goods.
 * When Excel left eligibility blank on an inward GST document, treat it as Input Goods
 * (purchase returns and BOX PURCHASES are blank in the master).
 */
export function getItcEligibility(transactionType${optStr})${typed ? ': ErpItcEligibility | null' : ''} {
  const found = getPostingRule(transactionType);
  if (found && found.itcEligibility) return found.itcEligibility;
  const u = String(transactionType || '').trim().toUpperCase();
  if (u.includes('PURCHASE RETURN')) return 'Input Goods';
  if (gstReturnSection(transactionType) === 'GSTR-2') return 'Input Goods';
  return null;
}

/**
 * Sign of the GST amounts on this document for GSTR-1 / GSTR-3B.
 * Credit notes and purchase / sales returns reverse tax or ITC.
 */
export function gstDocumentSign(transactionType${optStr})${typed ? ': number' : ''} {
  const u = String(transactionType || '').trim().toUpperCase();
  if (u.includes('RETURN') || u.includes('CREDIT NOTE')) return -1;
  const doc = getGstDocumentType(transactionType);
  if (doc === 'Credit Note' || doc === 'Credit Note (inward)') return -1;
  return 1;
}

/** Delivery challans move goods without creating a tax liability. */
export function isDeliveryChallanDocument(transactionType${optStr})${retBool} {
  const doc = getGstDocumentType(transactionType);
  return Boolean(doc && doc.startsWith('Delivery Challan'));
}

/**
 * Document number as printed: series code, optional GST suffix, padded counter.
 * The stored counter is untouched — this is display formatting only.
 */
export function formatSeriesBillNumber(
  transactionType${optStr},
  counter${typed ? '?: number | string | null' : ''},
  pad = 4
)${s} {
  if (counter == null || counter === '') return '';
  const numeric = Number(counter);
  const body = Number.isFinite(numeric) && numeric > 0
    ? String(Math.trunc(numeric)).padStart(pad, '0')
    : String(counter);
  const found = getPostingRule(transactionType);
  if (!found) return body;
  return [found.seriesCode, found.billSuffix, body].filter(Boolean).join('/');
}

/** One-line "where does this entry land" summary for entry screens. */
export function postingSummary(transactionType${optStr})${s} {
  const found = getPostingRule(transactionType);
  if (!found) return '—';
  const parts = [
    found.saleOrPurchaseAccount,
    found.partyAccountType,
    found.stockType ? \`Stock: \${found.stockType}\` : null,
    getItcEligibility(transactionType) ? \`ITC: \${getItcEligibility(transactionType)}\` : null
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

/** Distinct Sale/Pur A/C names from the master, for pickers. */
export const ERP_SALE_PURCHASE_ACCOUNTS${strArr} = Array.from(
  new Set(ERP_POSTING_RULES.map(row => row.saleOrPurchaseAccount).filter(Boolean))
).sort((a, b) => String(a).localeCompare(String(b)));
`;
}

fs.writeFileSync(tsOut, tsFile, 'utf8');
fs.writeFileSync(jsOut, jsFile, 'utf8');

const linked = all.filter(r => r.previousLink || r.nextLink);
console.log(`series: ${all.length} (${rules.length} from export + ${extensions.length} local)`);
console.log(`linked series: ${linked.length}`);
console.log(`wrote ${path.relative(repoRoot, tsOut)}`);
console.log(`wrote ${path.relative(repoRoot, jsOut)}`);
