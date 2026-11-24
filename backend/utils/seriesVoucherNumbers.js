import { canonicalSeriesName } from '../constants/erpTransactionPostingRules.js';
import { parseVoucherNumber } from './parseVoucherNumber.js';

/**
 * Empire stores an older year at 100000, 200000, … plus the printed voucher.
 * 100112 is printed 112*. 800023 is printed 23********. One star per 100000.
 */
export function empireVoucherLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  const whole = Math.trunc(n);
  if (whole < 100000) return String(whole);
  const years = Math.floor(whole / 100000);
  const printed = whole % 100000;
  if (!printed) return String(whole);
  return `${printed}${'*'.repeat(years)}`;
}

/** "112" is this year. "112*" is last year's 100112. */
export function storedVoucherNumber(raw) {
  const text = String(raw ?? '').trim();
  const stars = (text.match(/\*/g) || []).length;
  const printed = parseVoucherNumber(text);
  if (!printed) return null;
  if (stars > 0) return printed + stars * 100000;
  return printed;
}

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
