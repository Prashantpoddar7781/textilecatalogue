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
  const ours = (Array.isArray(lines) ? lines : []).map(line => ({ ...line }));
  const picks = [...(empireLines || [])].sort((a, b) => (Number(a.srNo) || 0) - (Number(b.srNo) || 0));
  const zipped = ours.length === picks.length && ours.every((line, index) => sameLine(line, picks[index]));
  const unused = picks.map(row => ({ ...row, used: false }));
  return ours.map((line, index) => {
    let pick = zipped ? picks[index] : null;
    if (!pick) {
      pick = unused.find(row => !row.used && sameLine(line, row));
      if (pick) pick.used = true;
    }
    const type = String(pick?.ordType || '').trim();
    const vno = Number(pick?.ordVno) || 0;
    if (!type || !vno) {
      return { ...line, empirePickType: null, empirePickVno: null, empirePickBill: null };
    }
    return {
      ...line,
      empirePickType: type,
      empirePickVno: vno,
      empirePickBill: pick.ordBill || null
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

function despatchLineNo(despatch, itemName) {
  const lines = Array.isArray(despatch?.lineItems) ? despatch.lineItems : [];
  const match = lines.find(row => normItem(row?.itemName) === normItem(itemName));
  const line = match || lines[0];
  return Number(line?.lineNo) || 1;
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
    const lines = (Array.isArray(receipt.lineItems) ? receipt.lineItems : []).map(line => {
      const despatch = byPick.get(pickKey(line?.empirePickType, line?.empirePickVno));
      if (!despatch) return clearLink(line);
      const sourceLineNo = despatchLineNo(despatch, line.itemName);
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
