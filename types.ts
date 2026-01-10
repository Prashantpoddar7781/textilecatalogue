
export interface TextileDesign {
  id: string;
  catalogueId?: string;
  catalogueName?: string;
  name: string; // Design name
  image: string; // Base64
  wholesalePrice: number;
  retailPrice: number;
  fabric: string;
  description: string;
  createdAt: number;
}

export interface Catalogue {
  id: string;
  name: string;
  userId: string;
  createdAt: number;
}

export interface CatalogueFilters {
  search: string;
  fabric: string;
  catalogue: string;
  minPrice: number;
  maxPrice: number;
  sortBy: 'newest' | 'price-low' | 'price-high';
}

export interface ShareOptions {
  includeWholesale: boolean;
  includeRetail: boolean;
  includeFabric: boolean;
  includeDescription: boolean;
  includeFirmName: boolean;
}
