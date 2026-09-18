import { ShareOptions, TextileDesign } from '../types';
import { DEFAULT_SHARE_OPTIONS } from '../services/sharePreferences';

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

const OPTION_KEYS: (keyof ShareOptions)[] = [
  'includeWholesale',
  'includeRetail',
  'includeFabric',
  'includeDescription',
  'includeFirmName',
  'includeCatalogueName',
  'includeDesignName'
];

export function sanitizeShareOptions(raw: unknown): ShareOptions {
  const source = raw && typeof raw === 'object' ? (raw as Partial<ShareOptions>) : {};
  const options = { ...DEFAULT_SHARE_OPTIONS };
  for (const key of OPTION_KEYS) {
    if (typeof source[key] === 'boolean') options[key] = source[key] as boolean;
  }
  return options;
}

/** Options stored on the link, or a legacy fallback from selectedPriceType. */
export function resolveShareDisplay(
  shareOptions: unknown,
  selectedPriceType?: string | null
): { options: ShareOptions; selectedPriceType: string } {
  const hasStored = Boolean(shareOptions && typeof shareOptions === 'object');
  const options = sanitizeShareOptions(shareOptions);
  if (!hasStored) {
    const showPrice = Boolean(selectedPriceType && selectedPriceType !== 'none');
    options.includeRetail = showPrice;
    options.includeDesignName = true;
    options.includeFabric = true;
  }
  const priceType = selectedPriceType && selectedPriceType !== 'none' ? selectedPriceType : 'base';
  return { options, selectedPriceType: priceType };
}
