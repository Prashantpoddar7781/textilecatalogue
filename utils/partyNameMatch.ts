const norm = (value: string) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function distance(a: string, b: string) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
    }
  }
  return rows[a.length][b.length];
}

/** Party search. "firoz ahmend" still finds "FIROZ AHMED". */
export function partyNameMatches(query: string, name: string) {
  const q = norm(query);
  const n = norm(name);
  if (!q) return true;
  if (n.includes(q)) return true;
  const qTokens = q.split(' ').filter(Boolean);
  const nTokens = n.split(' ').filter(Boolean);
  return qTokens.every(token => nTokens.some(part => {
    if (token.length >= 3 && (part.includes(token) || token.includes(part))) return true;
    if (part.startsWith(token) || token.startsWith(part)) return true;
    const limit = Math.min(token.length, part.length) >= 5 ? 2 : 1;
    return distance(token, part) <= limit;
  }));
}
