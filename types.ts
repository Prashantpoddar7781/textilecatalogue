
export interface AdditionalPrice {
  name: string;
  type: 'percentage' | 'fixed';
  value: number;
  calculatedPrice?: number;
}

export interface TextileDesign {
  id: string;
  catalogueId?: string;
  catalogueName?: string;
  name: string; // Design name
  image: string; // Base64
  basePrice: number;
  additionalPrices?: AdditionalPrice[];
  wholesalePrice: number; // For backward compatibility
  retailPrice: number; // For backward compatibility
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

export interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
  isSaved: boolean;
  lastShared?: number;
  deliveryStatus?: 'delivered' | 'undelivered' | 'unknown';
  createdAt: number;
  updatedAt: number;
}

export interface ShareLink {
  id: string;
  userId: string;
  designId: string;
  token: string;
  expiresAt?: string;
  isActive: boolean;
  selectedPriceType?: string;
  createdAt: string;
  updatedAt: string;
  design?: TextileDesign;
}
