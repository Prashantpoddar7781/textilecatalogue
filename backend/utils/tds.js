/**
 * TDS helpers for job-work / mill receipts (Sec 194C style defaults).
 * With PAN: Individual/HUF → 1%, Company/Firm/others → 2%.
 * Without PAN: no auto rate — user enters manually.
 */

export function extractPanFromGstin(gstin) {
  const g = String(gstin || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (g.length < 12) return '';
  return g.slice(2, 12);
}

export function normalizePan(pan) {
  return String(pan || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

export function isValidPan(pan) {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizePan(pan));
}

export function resolvePartyPan({ panNumber, gstNumber } = {}) {
  const direct = normalizePan(panNumber);
  if (isValidPan(direct)) return direct;
  const fromGst = extractPanFromGstin(gstNumber);
  if (isValidPan(fromGst)) return fromGst;
  return direct || fromGst || '';
}

/**
 * @returns {number|null} suggested % or null when PAN missing/invalid
 */
export function suggestTdsPercentFromPan(pan) {
  if (!isValidPan(pan)) return null;
  const typeChar = normalizePan(pan)[3];
  // P=Person, H=HUF → 1%; C=Company, F=Firm, A=AOP, T=Trust, etc. → 2%
  if (typeChar === 'P' || typeChar === 'H') return 1;
  return 2;
}

export function resolveTdsPercent({ panNumber, gstNumber, manualPercent } = {}) {
  if (manualPercent !== undefined && manualPercent !== null && manualPercent !== '') {
    const num = Number(manualPercent);
    if (Number.isFinite(num) && num >= 0) return num;
  }
  const pan = resolvePartyPan({ panNumber, gstNumber });
  const suggested = suggestTdsPercentFromPan(pan);
  return suggested != null ? suggested : 0;
}
