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
export function linesForSource(target, sourceId, { primaryIdField = 'workDespatchId', lineSourceField = 'sourceDespatchId' } = {}) {
  const lines = Array.isArray(target?.lineItems) ? target.lineItems : [];
  const tagged = lines.some(line => line && line[lineSourceField]);
  if (tagged) return lines.filter(line => line && line[lineSourceField] === sourceId);
  return target?.[primaryIdField] === sourceId ? lines : [];
}

/** True when the document uses per-line source tags rather than the legacy single link. */
export function hasPerLineSources(target, lineSourceField = 'sourceDespatchId') {
  const lines = Array.isArray(target?.lineItems) ? target.lineItems : [];
  return lines.some(line => line && line[lineSourceField]);
}

/**
 * Key used to match a target line back to the source line it consumed.
 * Falls back to the line number and then the item name, matching how quantities
 * were keyed before source line numbers existed.
 */
export function sourceLineKey(line) {
  return Number(line?.sourceLineNo)
    || Number(line?.lineNo)
    || String(line?.itemName || '').toLowerCase();
}
