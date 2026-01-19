
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
  designCode?: string;
  color?: string;
  stockQuantity?: number;
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
  designId?: string;
  token: string;
  expiresAt?: string;
  isActive: boolean;
  selectedPriceType?: string;
  createdAt: string;
  updatedAt: string;
  design?: TextileDesign;
  designs?: Array<{ design: TextileDesign }>;
}

export interface Order {
  id: string;
  userId: string;
  shareLinkId?: string;
  designId: string;
  buyerName: string;
  buyerPhone: string;
  quantity: number;
  status: string;
  createdAt: string;
  design?: TextileDesign;
  shareLink?: ShareLink;
}

export interface OrderDraftRecord {
  id: string;
  userId: string;
  sourceText: string;
  draftJson: OrderDraft;
  status: string;
  createdAt: string;
}

export interface OrderDraft {
  buyer_intent_summary: string;
  confidence_score: number;
  detected_designs: Array<{
    design_code?: string;
    matched_design_id?: string;
    quantity?: number;
    color?: string;
    notes?: string;
    is_out_of_stock?: boolean;
  }>;
  missing_information?: string[];
  delivery_notes?: string;
  price_constraints?: string;
  suggested_alternatives?: Array<{
    design_id?: string;
    reason?: string;
  }>;
}
