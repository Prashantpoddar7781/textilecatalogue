
export interface AdditionalPrice {
  name: string;
  type: 'percentage' | 'fixed';
  value: number;
  calculatedPrice?: number;
}

export interface CostingMaterial {
  materialName: string;
  unit: string;
  rate: number;
  avgPerPcs: number;
  supplierName?: string;
}

export interface CostingJob {
  jobType: string;
  rate: number;
  processDays: number;
  karigarName?: string;
  karigarGstNumber?: string;
  karigarFirmName?: string;
  karigarMobileNumber?: string;
  karigarAgentName?: string;
}

export interface CostingOtherCost {
  name: string;
  rate: number;
}

export interface DesignCostingDetails {
  materials: CostingMaterial[];
  jobs: CostingJob[];
  otherCosts: CostingOtherCost[];
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
  stockUnit?: 'pcs' | 'mtrs';
  pcsPerParcel?: number;
  moq?: number;
  basePrice: number;
  additionalPrices?: AdditionalPrice[];
  wholesalePrice: number; // For backward compatibility
  retailPrice: number; // For backward compatibility
  fabric: string;
  description: string;
  createdAt: number;
  /** Base64 images from AI modelling (model wearing the design) */
  aiModels?: string[];
  /** Optional design costing breakdown */
  costingDetails?: DesignCostingDetails;
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
  /** Show catalogue name on the shared image label */
  includeCatalogueName: boolean;
  /** Show design name / number on the shared image label */
  includeDesignName: boolean;
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
  designId?: string;
  buyerName: string;
  buyerPhone: string;
  quantity: number;
  status: string;
  remarks?: string | null;
  manualType?: 'open' | 'design' | null;
  manualBatchId?: string | null;
  createdAt: string;
  design?: TextileDesign;
  shareLink?: ShareLink;
}

export interface SubscriptionStatus {
  status: string | null;
  plan: string | null;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  isTrialActive: boolean;
  isFree: boolean;
  isActive: boolean;
  needsPayment: boolean;
}
