import { TextileDesign } from '../types';

export type CatalogueSortBy =
  | 'newest'
  | 'price-low'
  | 'price-high'
  | 'catalogue-az'
  | 'catalogue-za'
  | 'fabric-az'
  | 'fabric-za'
  | 'design-az'
  | 'design-za'
  | 'design-num-asc'
  | 'design-num-desc'
  | 'stock-low'
  | 'stock-high';

export const CATALOGUE_SORT_OPTIONS: Array<{ value: CatalogueSortBy; label: string }> = [
  { value: 'newest', label: 'Latest Uploads' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
  { value: 'catalogue-az', label: 'Catalogue name: A to Z' },
  { value: 'catalogue-za', label: 'Catalogue name: Z to A' },
  { value: 'fabric-az', label: 'Fabric name: A to Z' },
  { value: 'fabric-za', label: 'Fabric name: Z to A' },
  { value: 'design-az', label: 'Design name: A to Z' },
  { value: 'design-za', label: 'Design name: Z to A' },
  { value: 'design-num-asc', label: 'Design no.: Low to High' },
  { value: 'design-num-desc', label: 'Design no.: High to Low' },
  { value: 'stock-low', label: 'Stock: Low to High' },
  { value: 'stock-high', label: 'Stock: High to Low' }
];

export function designLabel(design: Pick<TextileDesign, 'name' | 'designCode'>): string {
  return String(design.name || design.designCode || '').trim();
}

export function catalogueNameOf(design: TextileDesign & { catalogue?: { name?: string | null } | null }): string {
  return String(design.catalogueName || design.catalogue?.name || '').trim();
}

export function designPriceOf(design: TextileDesign): number {
  return Number(design.basePrice ?? design.retailPrice ?? 0) || 0;
}

function localeCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function extractNumber(label: string): number | null {
  const match = String(label).match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function compareDesignNumber(a: TextileDesign, b: TextileDesign) {
  const labelA = designLabel(a);
  const labelB = designLabel(b);
  const numA = extractNumber(labelA);
  const numB = extractNumber(labelB);
  if (numA != null && numB != null && numA !== numB) return numA - numB;
  if (numA != null && numB == null) return -1;
  if (numA == null && numB != null) return 1;
  return localeCompare(labelA, labelB);
}

export function sortDesigns<T extends TextileDesign>(
  list: T[],
  sortBy: CatalogueSortBy | string,
  priceOf: (design: T) => number = designPriceOf
): T[] {
  const copy = [...list];
  switch (sortBy) {
    case 'price-low':
      return copy.sort((a, b) => priceOf(a) - priceOf(b));
    case 'price-high':
      return copy.sort((a, b) => priceOf(b) - priceOf(a));
    case 'catalogue-az':
      return copy.sort((a, b) => localeCompare(catalogueNameOf(a), catalogueNameOf(b)));
    case 'catalogue-za':
      return copy.sort((a, b) => localeCompare(catalogueNameOf(b), catalogueNameOf(a)));
    case 'fabric-az':
      return copy.sort((a, b) => localeCompare(a.fabric || '', b.fabric || ''));
    case 'fabric-za':
      return copy.sort((a, b) => localeCompare(b.fabric || '', a.fabric || ''));
    case 'design-az':
      return copy.sort((a, b) => localeCompare(designLabel(a), designLabel(b)));
    case 'design-za':
      return copy.sort((a, b) => localeCompare(designLabel(b), designLabel(a)));
    case 'design-num-asc':
      return copy.sort(compareDesignNumber);
    case 'design-num-desc':
      return copy.sort((a, b) => compareDesignNumber(b, a));
    case 'stock-low':
      return copy.sort((a, b) => (a.stockQuantity ?? 0) - (b.stockQuantity ?? 0));
    case 'stock-high':
      return copy.sort((a, b) => (b.stockQuantity ?? 0) - (a.stockQuantity ?? 0));
    case 'newest':
    default:
      return copy.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
}

export function uniqueDesignFilterOptions(designs: TextileDesign[]): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  const options: Array<{ value: string; label: string }> = [];
  for (const design of designs) {
    const label = designLabel(design);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ value: label, label });
  }
  return options.sort((a, b) => localeCompare(a.label, b.label));
}

export function matchesDesignFilter(design: TextileDesign, selected: string): boolean {
  if (!selected || selected === 'All') return true;
  return designLabel(design).toLowerCase() === selected.trim().toLowerCase();
}

export function formatOverlayPrice(amount: number): string {
  return `₹${(Number(amount) || 0).toLocaleString('en-IN')}`;
}
