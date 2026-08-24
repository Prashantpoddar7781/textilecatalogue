import fs from 'fs';
import path from 'path';

const sheetPath = process.argv[2];
const outPath = process.argv[3];

const xml = fs.readFileSync(sheetPath, 'utf8');

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');
}

function colToIndex(ref) {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const rows = [];
const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
let rowMatch;
while ((rowMatch = rowRe.exec(xml)) !== null) {
  const rowIndex = Number(rowMatch[1]);
  const body = rowMatch[2];
  const cells = [];
  const cellRe = /<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g;
  let cellMatch;
  while ((cellMatch = cellRe.exec(body)) !== null) {
    const attrs = cellMatch[1] ?? cellMatch[3] ?? '';
    const inner = cellMatch[2] ?? '';
    const refMatch = attrs.match(/r="([A-Z]+\d+)"/);
    if (!refMatch) continue;
    const col = colToIndex(refMatch[1]);
    const typeMatch = attrs.match(/t="([^"]+)"/);
    const type = typeMatch ? typeMatch[1] : 'n';
    let value = '';
    if (type === 'inlineStr') {
      const texts = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]);
      value = decodeEntities(texts.join(''));
    } else {
      const v = inner.match(/<v[^>]*>([\s\S]*?)<\/v>/);
      if (v) value = decodeEntities(v[1]);
      const isT = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      if (!v && isT) value = decodeEntities(isT[1]);
    }
    cells[col] = value.replace(/\r?\n/g, ' ').trim();
  }
  rows[rowIndex - 1] = cells;
}

const maxCols = rows.reduce((m, r) => Math.max(m, r ? r.length : 0), 0);
const lines = [];
for (let i = 0; i < rows.length; i += 1) {
  const r = rows[i] || [];
  const cells = [];
  for (let c = 0; c < maxCols; c += 1) cells.push(r[c] == null ? '' : r[c]);
  lines.push(cells.join('\t'));
}

fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`rows=${rows.length} cols=${maxCols} -> ${outPath}`);
