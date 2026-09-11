import { ShareOptions, TextileDesign } from '../types';

export function uniqueAdditionalPriceNames(designs: TextileDesign[]): string[] {
  const names = new Set<string>();
  for (const design of designs || []) {
    for (const price of design.additionalPrices || []) {
      if (price?.name) names.add(price.name);
    }
  }
  return [...names];
}

export function resolveAttachedPrice(
  design: TextileDesign,
  selectedPriceType: string
): { label: string; amount: number } {
  let amount = design.basePrice || design.retailPrice || 0;
  let label = 'Price';
  if (selectedPriceType && selectedPriceType !== 'base') {
    const selected = design.additionalPrices?.find(ap => ap.name === selectedPriceType);
    if (selected && selected.calculatedPrice) {
      amount = selected.calculatedPrice;
      label = selected.name;
    }
  }
  return { label, amount };
}

export function getShareAttachLines(
  design: TextileDesign,
  options: ShareOptions,
  selectedPriceType: string,
  userFirmName?: string | null
): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];

  if (options.includeFirmName && userFirmName?.trim()) {
    lines.push({ label: 'Firm', value: userFirmName.trim() });
  }
  if (options.includeCatalogueName && design.catalogueName?.trim()) {
    lines.push({ label: 'Catalogue', value: design.catalogueName.trim() });
  }
  if (options.includeDesignName) {
    const designLabel = design.name?.trim() || design.designCode?.trim();
    if (designLabel) lines.push({ label: 'Design', value: designLabel });
  }
  if (options.includeFabric && design.fabric) {
    lines.push({ label: 'Fabric', value: design.fabric });
  }
  if (options.includeRetail || options.includeWholesale) {
    const price = resolveAttachedPrice(design, selectedPriceType);
    lines.push({
      label: price.label,
      value: `₹${price.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
    });
  }
  if (options.includeDescription && design.description?.trim()) {
    lines.push({ label: 'Details', value: design.description.trim() });
  }
  return lines;
}
