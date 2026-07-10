/** Grey fabric quality options from legacy AMAZE GREY PURCHASE ENTRY master */
export const GREY_QUALITY_OPTIONS = [
  'DANI SARMILI',
  'FRANDY',
  'MABLE PLAIN',
  'MAJOR GEORJET',
  'NAZNEEN',
  'NET',
  'P.DANI SARMILI',
  'RENIYAL',
  'RENIYAL 6.300',
  'RENIYAL DENTING',
  'REYON 14KG',
  'RUSSION 7.200',
  'SOFIYA',
  'TORE PATTERN',
  'WETLES',
  'WETLESS BRIGHT PATTERN',
  'WHITE CAT',
  'ZOMATO SIMAR'
] as const;

export type GreyQuality = (typeof GREY_QUALITY_OPTIONS)[number];
