/** Empire Quality Information lists. They are not columns of one item. */

export const ITEM_OPTION_FIELDS = ['packing', 'greyQuality', 'type', 'itemType', 'screenSeries', 'category', 'unit'];

function addName(lists, field, value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name || name === '-') return;
  lists[field].add(name);
}

export function emptyItemFieldOptions() {
  return Object.fromEntries(ITEM_OPTION_FIELDS.map(field => [field, new Set()]));
}

/**
 * CATEGORY, PACKING and SCREENCOMP are the master lists.
 * Item type, unit and grey quality are the distinct values on QUAL.
 * Type is FINISH, or GREY when CLOTHTYPE is GREY.
 */
export function collectItemFieldOptions({ categories = [], packings = [], screens = [], quals = [] } = {}) {
  const lists = emptyItemFieldOptions();
  addName(lists, 'type', 'FINISH');
  addName(lists, 'type', 'GREY');
  for (const row of categories) addName(lists, 'category', row.CATEGORY || row.category || row.name);
  for (const row of packings) addName(lists, 'packing', row.PACKING || row.packing || row.name);
  for (const row of screens) addName(lists, 'screenSeries', row.SCREENCOMP || row.screenSeries || row.name);
  for (const row of quals) {
    addName(lists, 'packing', row.PACKING);
    addName(lists, 'unit', row.UNIT);
    addName(lists, 'itemType', row.CLOTHTYPE);
    addName(lists, 'screenSeries', row.SCREENCOMP);
    addName(lists, 'greyQuality', row.BASEQUAL);
    addName(lists, 'category', row.category);
  }
  return lists;
}

/** Fields copied from one QUAL row onto the item. The quality code is not the grey quality. */
export function qualItemFields(row) {
  const cloth = String(row.CLOTHTYPE || '').replace(/\s+/g, ' ').trim();
  const upper = cloth.toUpperCase();
  return {
    packing: String(row.PACKING || '').trim() || 'NAKED',
    unit: String(row.UNIT || '').trim() || 'PCS',
    finishType: upper === 'GREY' ? 'GREY' : 'FINISH',
    itemType: cloth && cloth !== '-' ? cloth : 'SAREE',
    screenSeries: String(row.SCREENCOMP || '').trim() || null,
    category: String(row.category || '').trim() || null,
    greyQuality: String(row.BASEQUAL || '').trim() || null
  };
}

export async function replaceItemFieldOptions(prisma, userId, sources) {
  const lists = collectItemFieldOptions(sources);
  const rows = [];
  for (const field of ITEM_OPTION_FIELDS) {
    for (const name of lists[field]) rows.push({ userId, field, name });
  }
  await prisma.itemFieldOption.deleteMany({ where: { userId } });
  for (let i = 0; i < rows.length; i += 200) {
    await prisma.itemFieldOption.createMany({ data: rows.slice(i, i + 200), skipDuplicates: true });
  }
  return Object.fromEntries(ITEM_OPTION_FIELDS.map(field => [field, lists[field].size]));
}
