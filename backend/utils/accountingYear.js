export function getCurrentAccountingYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear}-${String(endYear).slice(-2)}`;
}

export function listAccountingYearOptions(aroundDate = new Date()) {
  const current = getCurrentAccountingYear(aroundDate);
  const startYear = Number(current.slice(0, 4));
  const options = [];
  for (let offset = -2; offset <= 1; offset += 1) {
    const from = startYear + offset;
    const to = String(from + 1).slice(-2);
    options.push(`${from}-${to}`);
  }
  return options;
}

export function parseAccountingYear(label) {
  const match = String(label || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const startYear = Number(match[1]);
  const endYearShort = Number(match[2]);
  if ((startYear + 1) % 100 !== endYearShort) return null;
  return {
    label: `${startYear}-${String(startYear + 1).slice(-2)}`,
    startDate: new Date(Date.UTC(startYear, 3, 1)),
    endDate: new Date(Date.UTC(startYear + 1, 2, 31, 23, 59, 59, 999))
  };
}
