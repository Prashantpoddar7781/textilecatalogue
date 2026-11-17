/**
 * Empire stores the despatch a work-receipt line was picked from on the line
 * itself: BILLDET.ORDBILL is the challan number, ORDTYPE the series code,
 * orderno the despatch voucher. The receipt's CHALLAN column is the job
 * worker's own bill number, so it must not be used as the despatch.
 *
 * Each line is linked only to that despatch. A line is never spilled onto the
 * next challan. A line with no pick consumes nothing.
 */

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function normParty(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

export function normItem(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

export function isGenericItem(value) {
  const key = normItem(value);
  return !key || key === 'ITEM';
}

/** Previous-year voucher copied into the new year file. The live year's bill is the one that consumes stock. */
export function isPriorYearEmpireCopy(receipt) {
  const voucher = Number(receipt?.voucherNo) || 0;
  if (voucher >= 100000) return true;
  if (String(receipt?.billNo || '').includes('*')) return true;
  const tag = String(receipt?.remarks || '').match(/\[E:[^:\]]+:(\d+)\]/);
  return Boolean(tag && Number(tag[1]) >= 100000);
}

function pickKey(type, vno) {
  const code = String(type || '').trim().toUpperCase();
  const voucher = Number(vno) || 0;
  if (!code || !voucher) return '';
  return `${code}|${voucher}`;
}

function sameLine(our, empire) {
  return normItem(our?.itemName) === normItem(empire?.qual)
    && Math.abs((Number(our?.pcs) || 0) - (Number(empire?.pcs) || 0)) < 0.05;
}

/**
 * Copies Empire's PICK onto our lines. Same quality and pieces in the same
 * order zip directly. Otherwise each of our lines takes the next unused
 * Empire line of the same quality and pieces, in SRNO order.
 */
export function attachEmpirePicks(lines, empireLines) {
  return zipEmpireLines(lines, empireLines).map(({ line, empire }) => {
    const type = String(empire?.ordType || '').trim();
    const vno = Number(empire?.ordVno) || 0;
    const category = String(empire?.category || line.category || '').trim() || null;
    if (!type || !vno) {
      return { ...line, category, empirePickType: null, empirePickVno: null, empirePickBill: null };
    }
    return {
      ...line,
      category,
      empirePickType: type,
      empirePickVno: vno,
      empirePickBill: empire.ordBill || null
    };
  });
}

function clearLink(line) {
  return {
    ...line,
    sourceDespatchId: null,
    sourceChallanNo: null,
    sourceLineNo: null,
    sourceAllocations: []
  };
}

function zipEmpireLines(lines, empireLines) {
  const ours = (Array.isArray(lines) ? lines : []).map(line => ({ ...line }));
  const picks = [...(empireLines || [])].sort((a, b) => (Number(a.srNo) || 0) - (Number(b.srNo) || 0));
  const zipped = ours.length === picks.length && ours.every((line, index) => sameLine(line, picks[index]));
  const unused = picks.map(row => ({ ...row, used: false }));
  return ours.map((line, index) => {
    let empire = zipped ? picks[index] : null;
    if (!empire) {
      empire = unused.find(row => !row.used && sameLine(line, row));
      if (empire) empire.used = true;
    }
    return { line, empire };
  });
}

/** BILLDET.CATEGORY is the design on a despatch line (DARK BHAYA), not the quality. */
export function attachCategories(lines, empireLines) {
  return zipEmpireLines(lines, empireLines).map(({ line, empire }) => ({
    ...line,
    category: String(empire?.category || line.category || '').trim() || null
  }));
}

function despatchPool(despatch, line) {
  const lines = Array.isArray(despatch?.lineItems) ? despatch.lineItems : [];
  const item = normItem(line?.itemName);
  const category = normItem(line?.category);
  let pool = lines.filter(row => normItem(row?.itemName) === item);
  if (category) {
    const byCategory = pool.filter(row => normItem(row?.category) === category);
    if (byCategory.length) pool = byCategory;
  }
  if (!pool.length) pool = lines;
  return { lines, pool, category };
}

/**
 * The despatch line this receipt line was picked from.
 * Same quality and category stay on that design. An exact piece match is taken
 * before a smaller receipt is parked on a larger line of the same design, so
 * 53 pcs of COCO MILL closes the 53-pc line and leaves the 120-pc line open.
 * Without a category, every line of that quality stays on the first matching
 * despatch line.
 */
function matchDespatchLine(despatch, line, usedLineNos, { exactOnly = false } = {}) {
  const { lines, pool, category } = despatchPool(despatch, line);
  if (!category) {
    if (exactOnly) return 0;
    return Number(pool[0]?.lineNo || lines[0]?.lineNo) || 1;
  }
  const pcs = Number(line?.pcs) || 0;
  const free = pool.filter(row => !usedLineNos.has(Number(row?.lineNo) || 0));
  const candidates = free.length ? free : pool;
  const exact = candidates.find(row => Math.abs((Number(row?.pcs) || 0) - pcs) < 0.05);
  if (exactOnly) {
    if (!exact) return 0;
    const lineNo = Number(exact.lineNo) || 1;
    usedLineNos.add(lineNo);
    return lineNo;
  }
  const fits = candidates
    .filter(row => (Number(row?.pcs) || 0) + 0.05 >= pcs)
    .sort((a, b) => (Number(a.pcs) || 0) - (Number(b.pcs) || 0));
  const chosen = exact || (candidates.length === 1 ? candidates[0] : null) || fits[0] || candidates[0] || lines[0];
  const lineNo = Number(chosen?.lineNo) || 1;
  if (chosen) usedLineNos.add(lineNo);
  return lineNo;
}

/**
 * Links each imported receipt line to the despatch Empire picked.
 * Returns one update per Empire receipt so a previous guess can be cleared.
 */
export function allocateWorkReceipts({ despatches, receipts }) {
  const byPick = new Map();
  for (const despatch of despatches || []) {
    if (!despatch || despatch.status === 'cancelled') continue;
    const tag = String(despatch.remarks || '').match(/\[E:([^:\]]+):(\d+)\]/);
    if (!tag) continue;
    byPick.set(pickKey(tag[1], tag[2]), despatch);
  }

  const updates = [];
  for (const receipt of receipts || []) {
    if (!receipt || receipt.status === 'cancelled') continue;
    if (!/\[E:[^\]]+\]/.test(String(receipt.remarks || ''))) continue;
    const ids = [];
    const usedByDespatch = new Map();
    const rawLines = Array.isArray(receipt.lineItems) ? receipt.lineItems : [];
    const sourceLineNos = new Array(rawLines.length).fill(0);
    const despatchFor = (line) => byPick.get(pickKey(line?.empirePickType, line?.empirePickVno));
    for (const exactOnly of [true, false]) {
      rawLines.forEach((line, index) => {
        if (sourceLineNos[index]) return;
        const despatch = despatchFor(line);
        if (!despatch) return;
        const used = usedByDespatch.get(despatch.id) || new Set();
        usedByDespatch.set(despatch.id, used);
        sourceLineNos[index] = matchDespatchLine(despatch, line, used, { exactOnly });
      });
    }
    const lines = rawLines.map((line, index) => {
      const despatch = despatchFor(line);
      if (!despatch) return clearLink(line);
      const sourceLineNo = sourceLineNos[index] || 1;
      if (!ids.includes(despatch.id)) ids.push(despatch.id);
      return {
        ...line,
        sourceDespatchId: despatch.id,
        sourceChallanNo: despatch.challanNo || line.empirePickBill || null,
        sourceLineNo,
        sourceAllocations: [{
          sourceDespatchId: despatch.id,
          sourceChallanNo: despatch.challanNo || null,
          sourceLineNo,
          pcs: round2(line.pcs),
          mtsQty: round2(line.mtsQty)
        }]
      };
    });
    updates.push({
      id: receipt.id,
      workDespatchId: ids[0] || null,
      sourceDespatchIds: ids,
      lineItems: lines
    });
  }
  return updates;
}

/**
 * Empire often leaves DISCOUNT and billdis at 0 while VAT was charged on a
 * lower base (Bhagwati job bills are 12% off). Returns that percent, or 0 when
 * the gap is not a clean discount.
 */
export function impliedDiscountPercent({ grossAmount, gstRate, cgstAmount, sgstAmount, igstAmount, discountPercent }) {
  if (Number(discountPercent) > 0.001) return 0;
  const gross = Number(grossAmount) || 0;
  const rate = Number(gstRate) || 0;
  const tax = (Number(cgstAmount) || 0) + (Number(sgstAmount) || 0) + (Number(igstAmount) || 0);
  if (gross <= 1 || rate <= 0 || tax <= 0) return 0;
  const taxable = tax / (rate / 100);
  const gap = gross - taxable;
  if (gap <= 1) return 0;
  const pct = (gap / gross) * 100;
  const nearest = Math.round(pct * 10) / 10;
  if (Math.abs(pct - nearest) > 0.05) return 0;
  if (nearest <= 0 || nearest >= 40) return 0;
  return nearest;
}
