/**
 * Empire-style voucher typing: "6", "0006", "S51/F/0006", "986/F" → 6 / 986.
 * The last numeric group is the counter (series code / suffix come first).
 */
export function parseVoucherNumber(raw: string | number | null | undefined): number | null {
  const text = String(raw || '').trim().toUpperCase();
  if (!text) return null;
  const parts = text.split(/[/\s-]+/).filter(Boolean);
  const nums = parts
    .map(part => String(part).replace(/\D/g, ''))
    .filter(part => part.length > 0)
    .map(part => parseInt(part, 10))
    .filter(n => Number.isFinite(n) && n > 0);
  if (nums.length) return nums[nums.length - 1];
  return null;
}
