function findQuality(masters, line) {
  if (line.itemMasterId) {
    const byId = masters.find(item => item.id === line.itemMasterId);
    if (byId) return byId;
  }
  const name = String(line.itemName || line.description || '').trim().toLowerCase();
  if (!name) return null;
  return masters.find(item => String(item.name || '').trim().toLowerCase() === name) || null;
}

/**
 * Rate and cut typed on a bill line become the next default for that quality.
 * The last line for an item on the bill wins.
 */
export async function rememberItemRateAndCut(db, userId, lines) {
  if (!userId || !Array.isArray(lines) || !lines.length) return;
  const masters = await db.salesItemMaster.findMany({ where: { userId } });
  const latest = new Map();
  for (const line of lines) {
    const item = findQuality(masters, line);
    if (!item) continue;
    const rate = Number(line.rate) || 0;
    const cut = Number(line.cut) || 0;
    if (!(rate > 0) && !(cut > 0)) continue;
    latest.set(item.id, { rate, cut });
  }
  for (const [id, next] of latest) {
    const item = masters.find(row => row.id === id);
    const data = {};
    if (next.rate > 0 && Math.abs(next.rate - (Number(item.sellingRate) || 0)) > 0.001) data.sellingRate = next.rate;
    if (next.cut > 0 && Math.abs(next.cut - (Number(item.cut) || 0)) > 0.001) data.cut = next.cut;
    if (Object.keys(data).length) await db.salesItemMaster.update({ where: { id }, data });
  }
}
