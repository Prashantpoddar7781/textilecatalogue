/**
 * Empire does not store which work despatch challan a work receipt consumed.
 * The CHALLAN column on the receipt is the job worker's own bill number.
 *
 * Pending is issued pieces minus received pieces. Receipts are applied, oldest
 * first, onto the oldest open challan of the same party and the same quality,
 * and only onto a despatch series the Transaction Types master names as the
 * previous document. A previous-year copy (voucher 100000 and above, or a bill
 * number containing *) is not applied again: the new year's vouchers already
 * bill that work, and applying both closes the challan twice.
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

function seriesList(sourceSeriesFor, transactionType) {
  const list = typeof sourceSeriesFor === 'function' ? sourceSeriesFor(transactionType) : [];
  return (Array.isArray(list) ? list : [])
    .map(name => String(name || '').trim().toUpperCase())
    .filter(Boolean);
}

function receiptLines(receipt) {
  const lines = Array.isArray(receipt?.lineItems) ? receipt.lineItems : [];
  if (lines.length) return lines.map(line => ({ ...line }));
  const pcs = Number(receipt?.totalPcs) || 0;
  const mts = Number(receipt?.totalMts) || 0;
  if (pcs <= 0 && mts <= 0) return [];
  return [{ lineNo: 1, itemName: 'Item', pcs, mtsQty: mts }];
}

/**
 * @returns updates for receipts that received at least one challan link.
 * Each update is { id, workDespatchId, sourceDespatchIds, lineItems }.
 */
export function allocateWorkReceipts({ despatches, receipts, sourceSeriesFor }) {
  const poolsByParty = new Map();
  const sortedDespatches = [...(despatches || [])].filter(row => row && row.status !== 'cancelled').sort(byDateThenNumber);
  sortedDespatches.forEach((despatch, index) => {
    const party = normParty(despatch.partyName);
    if (!party) return;
    const lines = (Array.isArray(despatch.lineItems) ? despatch.lineItems : []).map((line, lineIndex) => ({
      lineNo: Number(line.lineNo) || lineIndex + 1,
      itemKey: normItem(line.itemName),
      pcs: Number(line.pcs) || 0,
      mts: Number(line.mtsQty) || 0
    })).filter(line => line.pcs > 0.001 || line.mts > 0.001);
    if (!lines.length && (Number(despatch.totalPcs) || 0) > 0) {
      lines.push({
        lineNo: 1,
        itemKey: '',
        pcs: Number(despatch.totalPcs) || 0,
        mts: Number(despatch.totalMts) || 0
      });
    }
    const pool = {
      id: despatch.id,
      challanNo: despatch.challanNo || '',
      series: String(despatch.transactionType || '').trim().toUpperCase(),
      order: index,
      lines
    };
    const list = poolsByParty.get(party) || [];
    list.push(pool);
    poolsByParty.set(party, list);
  });

  const updates = [];
  const sortedReceipts = [...(receipts || [])].filter(row => row && row.status !== 'cancelled').sort(byDateThenNumber);
  for (const receipt of sortedReceipts) {
    if (isPriorYearEmpireCopy(receipt)) continue;
    const party = normParty(receipt.partyName);
    const allowed = new Set(seriesList(sourceSeriesFor, receipt.transactionType));
    if (!party || !allowed.size) continue;
    const pools = (poolsByParty.get(party) || []).filter(pool => allowed.has(pool.series));
    if (!pools.length) continue;

    let linked = false;
    const lines = receiptLines(receipt).map(line => {
      const pcs = Number(line.pcs) || 0;
      const mts = Number(line.mtsQty) || 0;
      if (pcs <= 0.001 && mts <= 0.001) return line;
      const allowAny = isGenericItem(line.itemName);
      const matchKey = allowAny ? '' : normItem(line.itemName);
      const slices = takeSlices(pools, matchKey, pcs, mts, allowAny);
      if (!slices.length) return line;
      linked = true;
      return {
        ...line,
        sourceDespatchId: slices[0].sourceDespatchId,
        sourceChallanNo: slices.map(slice => slice.sourceChallanNo).filter(Boolean).join(', '),
        sourceLineNo: slices[0].sourceLineNo,
        sourceAllocations: slices
      };
    });
    if (!linked) continue;
    const ids = [];
    for (const line of lines) {
      for (const slice of line.sourceAllocations || []) {
        if (slice.sourceDespatchId && !ids.includes(slice.sourceDespatchId)) ids.push(slice.sourceDespatchId);
      }
    }
    updates.push({
      id: receipt.id,
      workDespatchId: ids[0] || null,
      sourceDespatchIds: ids,
      lineItems: lines
    });
  }
  return updates;
}

function takeSlices(pools, itemKey, pcsNeeded, mtsNeeded, allowAny) {
  const slices = [];
  let pcsLeft = pcsNeeded;
  let mtsLeft = mtsNeeded;
  const candidates = [];
  for (const pool of pools) {
    for (const line of pool.lines) {
      if (line.pcs <= 0.001) continue;
      if (itemKey && line.itemKey !== itemKey) continue;
      if (!itemKey && line.itemKey && !allowAny) continue;
      candidates.push({ pool, line });
    }
  }
  for (const { pool, line } of candidates) {
    if (pcsLeft <= 0.001) break;
    const takePcs = round2(Math.min(line.pcs, pcsLeft));
    let takeMts = pcsLeft > 0 ? round2(mtsLeft * (takePcs / pcsLeft)) : 0;
    takeMts = round2(Math.min(line.mts, takeMts));
    line.pcs = round2(line.pcs - takePcs);
    line.mts = round2(Math.max(0, line.mts - takeMts));
    pcsLeft = round2(pcsLeft - takePcs);
    mtsLeft = round2(Math.max(0, mtsLeft - takeMts));
    slices.push({
      sourceDespatchId: pool.id,
      sourceChallanNo: pool.challanNo || null,
      sourceLineNo: line.lineNo,
      pcs: takePcs,
      mtsQty: takeMts
    });
  }
  return slices;
}

function byDateThenNumber(a, b) {
  const aDate = new Date(a.despatchDate || a.receiptDate || 0).getTime();
  const bDate = new Date(b.despatchDate || b.receiptDate || 0).getTime();
  if (aDate !== bDate) return aDate - bDate;
  const aNo = Number(a.srNo || a.voucherNo) || 0;
  const bNo = Number(b.srNo || b.voucherNo) || 0;
  return aNo - bNo;
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
