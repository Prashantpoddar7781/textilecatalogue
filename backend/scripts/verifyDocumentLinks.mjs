/** Prints the document-link chains and flags links that name a series the master doesn't define. */

import {
  ERP_POSTING_RULES,
  getPostingRule,
  getSourceSeriesFor,
  getTargetSeriesFor
} from '../constants/erpTransactionPostingRules.js';

const known = new Set(ERP_POSTING_RULES.map(r => r.series.toUpperCase()));

console.log('--- declared links ---');
for (const rule of ERP_POSTING_RULES) {
  if (!rule.previousLink && !rule.nextLink) continue;
  const prev = rule.previousLink ? `prev=${rule.previousLink}` : '';
  const next = rule.nextLink ? `next=${rule.nextLink}` : '';
  console.log(`${rule.seriesCode.padEnd(5)} ${rule.series.padEnd(32)} ${prev.padEnd(38)} ${next}`);
}

console.log('\n--- dangling link targets ---');
let dangling = 0;
for (const rule of ERP_POSTING_RULES) {
  for (const [label, value] of [['previousLink', rule.previousLink], ['nextLink', rule.nextLink]]) {
    if (value && !known.has(value.toUpperCase())) {
      console.log(`${rule.series} -> ${label} "${value}" is not a defined series`);
      dangling += 1;
    }
  }
}
if (!dangling) console.log('none');

console.log('\n--- resolved sources per receipt series ---');
for (const rule of ERP_POSTING_RULES) {
  const sources = getSourceSeriesFor(rule.series);
  if (!sources.length) continue;
  console.log(`${rule.series.padEnd(32)} <- ${sources.join(' | ')}`);
}

console.log('\n--- resolved targets per challan series ---');
for (const rule of ERP_POSTING_RULES) {
  const targets = getTargetSeriesFor(rule.series);
  if (!targets.length) continue;
  console.log(`${rule.series.padEnd(32)} -> ${targets.join(' | ')}`);
}

console.log('\n--- stock effect ---');
for (const rule of ERP_POSTING_RULES) {
  if (rule.stockEffect == null) continue;
  console.log(`${rule.series.padEnd(32)} ${rule.stockEffect > 0 ? 'IN ' : 'OUT'} ${rule.stockType || '(no stock type)'}`);
}

const compulsory = ERP_POSTING_RULES.filter(r => r.compulsoryLink);
const copies = ERP_POSTING_RULES.filter(r => r.copyItemDetailsAfterRef);
const showAll = ERP_POSTING_RULES.filter(r => r.showAllEntriesInPick);
console.log('\n--- pick behaviour flags ---');
console.log(`compulsoryLink: ${compulsory.map(r => r.series).join(', ') || 'none'}`);
console.log(`copyItemDetailsAfterRef: ${copies.map(r => r.series).join(', ') || 'none'}`);
console.log(`showAllEntriesInPick: ${showAll.map(r => r.series).join(', ') || 'none'}`);

console.log('\n--- spot checks ---');
for (const series of ['WORK REC. BILLS', 'WORK REC. SUIT BILLS', 'FINISH SALES', 'GREY PURCHASE']) {
  const rule = getPostingRule(series);
  console.log(`${series}: code=${rule?.seriesCode} hsn=${rule?.defaultHsnCode} gst=${(rule?.cgstPercent ?? 0) + (rule?.sgstPercent ?? 0)}% itc=${rule?.itcEligibility} tds=${rule?.tdsAccount}`);
}
