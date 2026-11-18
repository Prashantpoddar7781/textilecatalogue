const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * A printed FOLD of 95 is what remains of 100, so the less-fold percent is 5.
 * A figure of 50 or less is already that percent.
 */
export function lessFoldPercent(value: number | string | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 50 && n <= 100) return round2(100 - n);
  return round2(n);
}

/** Gross metres after the less-fold percent, before rounding. Amount uses this. */
export function billedMetres(mts: number | string | null | undefined, lessFold: number | string | null | undefined): number {
  const metres = Number(mts) || 0;
  const fold = Number(lessFold) || 0;
  if (!(metres > 0)) return 0;
  if (!(fold > 0) || fold >= 100) return metres;
  return metres * (100 - fold) / 100;
}

/** Net metres shown on the bill: gross metres minus the less-fold percent. */
export function netMetres(mts: number | string | null | undefined, lessFold: number | string | null | undefined): number {
  return round2(billedMetres(mts, lessFold));
}
