/** Nearest rupee. 1000.40 → 1000, 1000.50 → 1001. */
export function roundRupee(value: number) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  if (!Number.isFinite(n) || n === 0) return 0;
  return Math.round(n + Math.sign(n) * 1e-9);
}
