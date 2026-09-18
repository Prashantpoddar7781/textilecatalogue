const OPTION_KEYS = [
  'includeWholesale',
  'includeRetail',
  'includeFabric',
  'includeDescription',
  'includeFirmName',
  'includeCatalogueName',
  'includeDesignName'
];

const DEFAULTS = {
  includeWholesale: false,
  includeRetail: false,
  includeFabric: true,
  includeDescription: false,
  includeFirmName: false,
  includeCatalogueName: false,
  includeDesignName: true
};

export function sanitizeShareOptions(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const options = { ...DEFAULTS };
  for (const key of OPTION_KEYS) {
    if (typeof source[key] === 'boolean') options[key] = source[key];
  }
  return options;
}
