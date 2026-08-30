/**
 * Which lines of a target document belong to a given source document.
 *
 * Kept dependency-free so both the pending calculation and the link engine can use
 * the same rule, and so it can be tested without a database.
 */

/**
 * Lines of `target` that were received against `sourceId`.
 *
 * Documents saved before multi-source billing carry no per-line source tag. For
 * those the whole document belongs to its primary source, which is how the single
 * challan per bill era behaved — so historical pending stays exactly as it was.
 */
export function linesForSource(target, sourceId, {
  primaryIdField = 'workDespatchId',
  lineSourceField = 'sourceDespatchId',
  linesField = 'lineItems'
} = {}) {
  const lines = Array.isArray(target?.[linesField]) ? target[linesField] : [];
  const tagged = lines.some(line => line && line[lineSourceField]);
  if (tagged) return lines.filter(line => line && line[lineSourceField] === sourceId);
  return target?.[primaryIdField] === sourceId ? lines : [];
}

/** True when the document uses per-line source tags rather than the legacy single link. */
export function hasPerLineSources(target, lineSourceField = 'sourceDespatchId', linesField = 'lineItems') {
  const lines = Array.isArray(target?.[linesField]) ? target[linesField] : [];
  return lines.some(line => line && line[lineSourceField]);
}

/**
 * Key used to match a target line back to the source line it consumed.
 * Falls back to the line number and then the item name, matching how quantities
 * were keyed before source line numbers existed.
 */
/**
 * How much of a sales-bill line belongs to one Sales Order.
 * Merged same-name lines store the split in sourceAllocations so pending
 * is not dumped onto the first order.
 */
export function qtySlicesForSalesOrder(line, salesOrderId) {
  const allocs = Array.isArray(line?.sourceAllocations) ? line.sourceAllocations : [];
  if (allocs.length) {
    return allocs
      .filter(alloc => alloc && alloc.sourceSalesOrderId === salesOrderId)
      .map(alloc => ({
        sourceLineNo: Number(alloc.sourceLineNo) || 0,
        pcs: Number(alloc.pcs) || 0,
        mtsQty: Number(alloc.mtsQty) || 0
      }));
  }
  if (line?.sourceSalesOrderId && line.sourceSalesOrderId === salesOrderId) {
    return [{
      sourceLineNo: Number(line.sourceLineNo || line.lineNo) || 0,
      pcs: Number(line.pcs ?? line.quantity) || 0,
      mtsQty: Number(line.mtsQty) || 0
    }];
  }
  return [];
}

export function sourceLineKey(line) {
  return Number(line?.sourceLineNo)
    || Number(line?.lineNo)
    || String(line?.itemName || '').toLowerCase();
}
