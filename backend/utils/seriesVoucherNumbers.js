import { canonicalSeriesName } from '../constants/erpTransactionPostingRules.js';

/** Current-year voucher. Prior-year copies (100000 and above, or a starred number) do not set the next number. */
function liveNumber(value) {
  const text = String(value ?? '').trim();
  if (!text || text.includes('*')) return 0;
  const n = parseInt(text, 10);
  if (!Number.isFinite(n) || n <= 0 || n >= 100000) return 0;
  return n;
}

/** Next free number for each series name, shared by aliases of the same series. */
export function nextNumberByType(rows, types, readNumber) {
  const max = new Map();
  for (const row of rows || []) {
    const key = canonicalSeriesName(row.transactionType);
    const n = liveNumber(readNumber(row));
    if (!key || !n) continue;
    max.set(key, Math.max(max.get(key) || 0, n));
  }
  const out = {};
  for (const type of types) {
    const key = canonicalSeriesName(type);
    out[type] = (max.get(key) || 0) + 1;
  }
  return out;
}
