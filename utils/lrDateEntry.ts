export type DateSegment = 0 | 1 | 2;

export interface DateDigit {
  iso: string;
  text: string;
  segment: DateSegment;
  pending: string;
}

function valid(day: number, month: number, year: number) {
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function partsFromIso(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').slice(0, 10));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!valid(day, month, year)) return null;
  return { day, month, year };
}

export function displayLrDate(iso: string) {
  const parts = partsFromIso(iso);
  if (!parts) return '';
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${String(parts.year).slice(-2).padStart(2, '0')}`;
}

function withPending(iso: string, segment: DateSegment, pending: string) {
  const parts = partsFromIso(iso);
  const slots = parts
    ? [
      String(parts.day).padStart(2, '0'),
      String(parts.month).padStart(2, '0'),
      String(parts.year).slice(-2).padStart(2, '0')
    ]
    : ['  ', '  ', '  '];
  if (pending) slots[segment] = (pending + ' ').slice(0, 2);
  return `${slots[0]}/${slots[1]}/${slots[2]}`;
}

export function applyDateDigit(iso: string, segment: DateSegment, pending: string, digit: string): DateDigit {
  const current = partsFromIso(iso);
  if (!current || !/^\d$/.test(digit)) {
    return { iso, text: displayLrDate(iso), segment, pending };
  }
  const started = pending + digit;
  const singleJump = pending === '' && ((segment === 0 && Number(digit) > 3) || (segment === 1 && Number(digit) > 1));
  if (!singleJump && started.length < 2) {
    return { iso, text: withPending(iso, segment, started), segment, pending: started };
  }
  const amount = Number(started);
  const next = { ...current };
  if (segment === 0) next.day = amount;
  else if (segment === 1) next.month = amount;
  else next.year = Math.floor(current.year / 100) * 100 + (amount % 100);
  if (!valid(next.day, next.month, next.year)) {
    return { iso, text: displayLrDate(iso), segment, pending: '' };
  }
  const built = `${next.year}-${String(next.month).padStart(2, '0')}-${String(next.day).padStart(2, '0')}`;
  const advance: DateSegment = segment < 2 ? ((segment + 1) as DateSegment) : segment;
  return { iso: built, text: displayLrDate(built), segment: advance, pending: '' };
}

export function commitDatePending(iso: string, segment: DateSegment, pending: string) {
  if (!pending) return iso;
  if (segment === 2) return iso;
  const current = partsFromIso(iso);
  if (!current) return iso;
  const next = { ...current };
  const amount = Number(pending);
  if (segment === 0) next.day = amount;
  else next.month = amount;
  if (!valid(next.day, next.month, next.year)) return iso;
  return `${next.year}-${String(next.month).padStart(2, '0')}-${String(next.day).padStart(2, '0')}`;
}
