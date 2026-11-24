/** Empire stores an older year at 100000 and above. 100112 prints as 112*. */
export function empireVoucherLabel(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  const whole = Math.trunc(n);
  if (whole < 100000) return String(whole);
  const years = Math.floor(whole / 100000);
  const printed = whole % 100000;
  if (!printed) return String(whole);
  return `${printed}${'*'.repeat(years)}`;
}
