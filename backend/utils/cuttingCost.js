const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

function dateKey(value) {
  if (!value) return null;
  const text = value instanceof Date ? value.toISOString() : String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function utcDay(key) {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Calendar days from the grey bill to the cutting date. 31 Aug to 8 Oct is 38. */
export function interestDaySpan(fromValue, toValue) {
  const from = dateKey(fromValue);
  const to = dateKey(toValue);
  if (!from || !to) return 0;
  const diff = Math.round((utcDay(to) - utcDay(from)) / 86400000);
  return diff > 0 ? diff : 0;
}

/**
 * Cutting cost for one dispatch challan (cut card).
 * INT is interest on the grey, per fresh saree.
 * Basic cost is (grey + printing + interest) ÷ fresh sarees.
 * Cost without interest is (grey + printing) ÷ fresh sarees.
 * INT is basic cost minus cost without interest.
 * Challan 43 at 24% for 38 days is basic 206.13, cost without interest 201.83, INT 4.30.
 */
export function buildCuttingCost(input) {
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
  const costWithoutInterest = freshSarees > 0 ? round2((greyAmount + jobAmount) / freshSarees) : 0;
  const costWithDiscount = freshSarees > 0
    ? round2((greyAmount + jobAmount - discountAmount) / freshSarees)
    : 0;
  // Basic cost is grey + printing + interest, per saree. Lot 25301 is 198.23,
  // which is 194.12 without interest. INT is the gap between those two figures.
  const basicCost = freshSarees > 0
    ? round2((greyAmount + jobAmount + interestAmount) / freshSarees)
    : 0;
  const interestPerPc = freshSarees > 0 ? round2(basicCost - costWithoutInterest) : 0;

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
