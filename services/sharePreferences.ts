import { ShareOptions } from '../types';

const STORAGE_KEY = 'textilehub_share_preferences';

/** Defaults for share dialog; merged with stored partials on load. */
export const DEFAULT_SHARE_OPTIONS: ShareOptions = {
  includeWholesale: false,
  includeRetail: true,
  includeFabric: true,
  includeDescription: false,
  includeFirmName: false,
  includeCatalogueName: false,
  includeDesignName: true
};

export function loadSharePreferences(): {
  options: ShareOptions;
  selectedPriceType: string;
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { options: { ...DEFAULT_SHARE_OPTIONS }, selectedPriceType: 'base' };
    }
    const parsed = JSON.parse(raw) as Partial<{
      options: Partial<ShareOptions>;
      selectedPriceType: string;
    }>;
    return {
      options: { ...DEFAULT_SHARE_OPTIONS, ...parsed.options },
      selectedPriceType:
        typeof parsed.selectedPriceType === 'string' ? parsed.selectedPriceType : 'base'
    };
  } catch {
    return { options: { ...DEFAULT_SHARE_OPTIONS }, selectedPriceType: 'base' };
  }
}

export function saveSharePreferences(data: {
  options: ShareOptions;
  selectedPriceType: string;
}): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota / private mode
  }
}
