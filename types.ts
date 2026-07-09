
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
  firmName?: string;
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
  inventory: 'all' | 'available';
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
  securityMode?: 'normal' | 'device_locked';
  lockedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  design?: TextileDesign;
  designs?: Array<{ design: TextileDesign }>;
}

export interface Customer {
  id: string;
  organizationName: string;
  gstNumber?: string | null;
  contactPersonName?: string | null;
  mobileNumber?: string | null;
  agentName?: string | null;
  category?: string | null;
  state?: string | null;
  city?: string | null;
  pincode?: string | null;
  discountRate?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Order {
  id: string;
  userId: string;
  shareLinkId?: string;
  customerId?: string | null;
  designId?: string;
  buyerName: string;
  buyerPhone: string;
  quantity: number;
  orderLines?: Array<{
    designId: string;
    designName?: string | null;
    designCode?: string | null;
    image?: string | null;
    fabric?: string | null;
    basePrice?: number | null;
    retailPrice?: number | null;
    quantity: number;
    remarks?: string | null;
    completed?: boolean;
    completedAt?: string | null;
  }> | null;
  status: 'waiting_approval' | 'pending' | 'completed' | string;
  remarks?: string | null;
  manualType?: 'open' | 'design' | null;
  manualBatchId?: string | null;
  priceCategory?: string | null;
  orderNumber?: string | null;
  invoiceNumber?: number | null;
  transactionType?: string | null;
  typeBillNumber?: number | null;
  agentName?: string | null;
  transportName?: string | null;
  discountRate?: number | null;
  shippingCharge?: number | null;
  orderDate?: string | null;
  expectedDate?: string | null;
  haste?: string | null;
  station?: string | null;
  createdAt: string;
  customer?: Customer | null;
  design?: TextileDesign;
  shareLink?: ShareLink;
}

export interface BusinessProfile {
  id: string;
  userId: string;
  legalName?: string | null;
  tradeName?: string | null;
  companyCode?: string | null;
  companyType?: string | null;
  companyGroup?: string | null;
  gstNumber?: string | null;
  panNumber?: string | null;
  udyamNumber?: string | null;
  tdsAccountNumber?: string | null;
  msmeType?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  mobileNumber?: string | null;
  fax?: string | null;
  email?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  bankIfsc?: string | null;
  rtgsAccount?: string | null;
  businessDescription?: string | null;
  proprietor?: string | null;
  invoicePrefix: string;
  defaultHsnCode?: string | null;
  defaultGstRate: number;
  terms?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalesInvoiceLine {
  sourceDesignId?: string | null;
  description: string;
  designName?: string | null;
  designCode?: string | null;
  fabric?: string | null;
  image?: string | null;
  hsnCode?: string | null;
  quantity: number;
  unit: string;
  rate: number;
  gstRate: number;
  grossAmount: number;
  discountAmount: number;
  taxableAmount: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxAmount: number;
  totalAmount: number;
  remarks?: string | null;
}

export interface SalesInvoice {
  id: string;
  userId: string;
  orderId: string;
  customerId?: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  status: 'unpaid' | 'partial' | 'paid' | string;
  sellerSnapshot: Partial<BusinessProfile>;
  buyerSnapshot: {
    name?: string | null;
    gstNumber?: string | null;
    contactPersonName?: string | null;
    mobileNumber?: string | null;
    state?: string | null;
    city?: string | null;
    pincode?: string | null;
  };
  lineItems: SalesInvoiceLine[];
  placeOfSupply?: string | null;
  taxableAmount: number;
  discountAmount: number;
  shippingCharge: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTaxAmount: number;
  grandTotal: number;
  amountPaid: number;
  amountDue: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  order?: Pick<Order, 'id' | 'orderNumber' | 'status' | 'createdAt'>;
  customer?: Customer | null;
}

export interface PurchaseBillLine {
  description: string;
  hsnCode?: string | null;
  quantity: number;
  cut?: number | null;
  pcs?: number | null;
  unit?: string | null;
  rate?: number | null;
  amount: number;
  remarks?: string | null;
}

export interface Supplier {
  id: string;
  userId: string;
  name: string;
  gstNumber?: string | null;
  mobileNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  billCount?: number;
  runningBalance?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseBill {
  id: string;
  userId: string;
  supplierId: string;
  supplier?: Supplier;
  billNumber?: string | null;
  billDate?: string | null;
  voucherNumber?: string | null;
  image?: string | null;
  extractedText?: string | null;
  extractionJson?: any;
  lineItems: PurchaseBillLine[];
  taxableAmount: number;
  discountAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTaxAmount: number;
  grandTotal: number;
  transactionType?: string | null;
  typeBillNumber?: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseBillExtraction {
  supplier: {
    name: string;
    gstNumber?: string | null;
    mobileNumber?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
  };
  billNumber?: string | null;
  billDate?: string | null;
  voucherNumber?: string | null;
  lineItems: PurchaseBillLine[];
  taxableAmount: number;
  discountAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTaxAmount: number;
  grandTotal: number;
  extractedText?: string | null;
  confidence?: string | null;
  notes?: string | null;
}

export interface SupplierLedgerEntry {
  id: string;
  date: string;
  billNumber?: string | null;
  voucherNumber?: string | null;
  account: string;
  creditAmount: number;
  debitAmount: number;
  runningBalance: number;
  status: string;
  lineCount: number;
}

export interface AccountLedgerEntry {
  id: string;
  sourceType: 'order' | 'sales_invoice' | 'purchase_bill' | 'bank_entry' | 'credit_debit_note' | string;
  sourceId: string;
  date: string;
  voucherNumber?: string | null;
  billNumber?: string | null;
  account: string;
  particulars: string;
  debitAmount: number;
  creditAmount: number;
  runningBalance: number;
  balanceType: 'DR' | 'CR';
  lineCount?: number;
}

export interface AccountLedgerParty {
  partyType: 'customer' | 'supplier';
  partyName: string;
  customerId?: string | null;
  supplierId?: string | null;
  gstNumber?: string | null;
  mobileNumber?: string | null;
  entryCount?: number;
  runningBalance?: number;
}

export interface LedgerEntryDetailField {
  label: string;
  value: string | number;
  isMoney?: boolean;
}

export interface LedgerEntryDetailColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  isMoney?: boolean;
}

export interface LedgerEntryDetail {
  title: string;
  subtitle?: string;
  sourceType: string;
  sourceId: string;
  fields: LedgerEntryDetailField[];
  lineColumns?: LedgerEntryDetailColumn[];
  lineItems?: Array<Record<string, string | number | null>>;
}

export type ErpAccessLevel = 'data_entry' | 'complete_access';

export interface ErpUserAccount {
  id: string;
  ownerUserId: string;
  name: string;
  accessLevel: ErpAccessLevel;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ErpSession {
  erpUserId: string | null;
  name: string;
  accessLevel: ErpAccessLevel;
  accountingYear: string;
  ownerUserId: string;
  bypass?: boolean;
}

export interface BankBillAllocation {
  billId: string;
  billType: 'order' | 'sales_invoice' | 'purchase_bill' | string;
  billNumber: string;
  voucherNumber?: string | null;
  billDate?: string | null;
  days: number;
  grace?: number;
  adatDisc?: number;
  billAmount: number;
  pendingAmount: number;
  taxableAmount?: number;
  adjustAmount: number;
  adjustDirection?: 'add' | 'deduct' | string;
  entryKind?: string;
  noteKind?: string;
  noteSide?: string;
}

export interface BankEntry {
  id: string;
  userId: string;
  entryType: 'payment' | 'receipt';
  transactionType?: string | null;
  entryDate: string;
  voucherNumber?: string | null;
  companyName?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  partyType?: 'customer' | 'supplier' | 'other' | string | null;
  partyName: string;
  linkedType?: 'sales_invoice' | 'purchase_bill' | 'order' | 'none' | string | null;
  linkedId?: string | null;
  amount: number;
  paymentMode?: string | null;
  referenceNumber?: string | null;
  chequeNumber?: string | null;
  chequeDate?: string | null;
  slipNumber?: string | null;
  billNumber?: string | null;
  billAllocations?: BankBillAllocation[] | null;
  grossAmount?: number;
  adjustPending?: number;
  netBillAmount?: number;
  adjustAdd?: number;
  taxableValuePaidBills?: number;
  remarks?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompletedOrderParty {
  name: string;
  orderCount: number;
  pendingAmount: number;
}

export interface PurchaseBillParty {
  name: string;
  billCount: number;
  pendingAmount: number;
}

export interface BankPendingBill {
  billId: string;
  billType: 'order' | 'sales_invoice' | 'purchase_bill' | string;
  billNumber: string;
  transactionType?: string | null;
  voucherNumber?: string | null;
  billDate?: string | null;
  days: number;
  grace?: number;
  adatDisc?: number;
  billAmount: number;
  pendingAmount: number;
  taxableAmount?: number;
  adjustAmount: number;
  entryKind?: 'bill' | 'credit_note' | 'debit_note' | string;
  noteKind?: 'credit' | 'debit' | string;
  noteSide?: 'sales' | 'purchase' | string;
  adjustDirection?: 'add' | 'deduct' | string;
  refBillNumber?: string | null;
  adjustBillNumber?: string | null;
  adjustBillId?: string | null;
  linkedNoteIds?: string[];
  linkedCreditAmount?: number;
  linkedDebitAmount?: number;
  netPendingAmount?: number;
}

export interface CreditDebitNote {
  id: string;
  userId: string;
  noteKind: 'credit' | 'debit';
  noteSide: 'sales' | 'purchase';
  companyName?: string | null;
  voucherNumber?: number | null;
  noteNumber?: string | null;
  noteDate: string;
  partyType: 'customer' | 'supplier';
  partyName: string;
  customerId?: string | null;
  supplierId?: string | null;
  placeOfSupply?: string | null;
  gstType?: string | null;
  refBillNumber?: string | null;
  refBillDate?: string | null;
  challanNumber?: string | null;
  saleAccount?: string | null;
  purchaseType?: string | null;
  pieces: number;
  quantity: number;
  grossAmount: number;
  discountPercent: number;
  discountAmount: number;
  otherLess: number;
  addAmount: number;
  returnGoods: number;
  hsnSac?: string | null;
  taxableAmount: number;
  gstRate: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTaxAmount: number;
  tcsRate: number;
  tcsAmount: number;
  netAmount: number;
  netAmountAfterTds: number;
  paidAmount: number;
  isPaid: boolean;
  adjustBillNumber?: string | null;
  adjustBillId?: string | null;
  remarks?: string | null;
  isTally: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionStatus {
  status: string | null;
  plan: string | null;
  source: string | null;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  isTrialActive: boolean;
  isFree: boolean;
  isActive: boolean;
  needsPayment: boolean;
  promoExpired?: boolean;
  designCount?: number;
  freeDesignLimit?: number;
  freeDesignsRemaining?: number;
  isFreeDesignAllowanceActive?: boolean;
}
