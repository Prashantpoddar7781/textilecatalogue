
export interface TextileDesign {
  id: string;
  image: string; // Base64
  wholesalePrice: number;
  retailPrice: number;
  fabric: string;
  description: string;
  createdAt: number;
}

export interface CatalogueFilters {
  search: string;
  fabric: string;
  minPrice: number;
  maxPrice: number;
  sortBy: 'newest' | 'price-low' | 'price-high';
}

export interface ShareOptions {
  includeWholesale: boolean;
  includeRetail: boolean;
  includeFabric: boolean;
  includeDescription: boolean;
}
