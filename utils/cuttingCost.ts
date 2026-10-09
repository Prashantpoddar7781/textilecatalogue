const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

function dateKey(value?: string | Date | null) {
  if (!value) return null;
  const text = value instanceof Date ? value.toISOString() : String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function utcDay(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Calendar days from the grey bill to the cutting date. 31 Aug to 8 Oct is 38. */
export function interestDaySpan(fromValue?: string | Date | null, toValue?: string | Date | null) {
  const from = dateKey(fromValue);
  const to = dateKey(toValue);
  if (!from || !to) return 0;
  const diff = Math.round((utcDay(to) - utcDay(from)) / 86400000);
  return diff > 0 ? diff : 0;
}

export interface CuttingCostInput {
  greyMts: number;
  greyRate: number;
  finMts: number;
  jobRate: number;
  discountPercent: number;
  freshSarees: number;
  interestRate: number;
  interestDays: number;
}

/**
 * INT is interest on the grey, per fresh saree:
 * grey amount × interest % × days ÷ 360 ÷ fresh sarees.
 * Challan 43 is −4.30: 1,213 m × ₹23.50 × 24% × 38 days ÷ 360 ÷ 168.
 */
export function buildCuttingCost(input: CuttingCostInput) {
  const greyMts = Number(input.greyMts) || 0;
  const greyRate = Number(input.greyRate) || 0;
  const finMts = Number(input.finMts) || 0;
  const jobRate = Number(input.jobRate) || 0;
  const discountPercent = Number(input.discountPercent) || 0;
  const freshSarees = Number(input.freshSarees) || 0;
  const interestRate = Number(input.interestRate) || 0;
  const interestDays = Number(input.interestDays) || 0;

  const greyAmount = round2(greyMts * greyRate);
  const jobAmount = round2(finMts * jobRate);
  const discountAmount = round2(jobAmount * discountPercent / 100);
  const shortMts = round2(Math.max(0, greyMts - finMts));
  const shortPct = greyMts > 0 ? round2((shortMts / greyMts) * 100) : 0;
  const actCut = freshSarees > 0 ? round2(finMts / freshSarees) : 0;
  const interestAmount = round2((greyAmount * interestRate * interestDays) / 36000);
  const interestPerPc = freshSarees > 0 ? round2(interestAmount / freshSarees) : 0;
  const costWithoutInterest = freshSarees > 0 ? round2((greyAmount + jobAmount) / freshSarees) : 0;
  const costWithDiscount = freshSarees > 0
    ? round2((greyAmount + jobAmount - discountAmount) / freshSarees)
    : 0;
  const basicCost = freshSarees > 0 ? round2(costWithoutInterest + interestPerPc) : 0;

  return {
    greyAmount,
    jobAmount,
    discountAmount,
    shortMts,
    shortPct,
    actCut,
    interestAmount,
    interestPerPc,
    costWithoutInterest,
    costWithDiscount,
    basicCost
  };
}
