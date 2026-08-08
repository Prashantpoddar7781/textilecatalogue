
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
  manualType?: 'open' | 'design' | 'erp_sales' | null;
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
  sourceSalesOrderId?: string | null;
  sourceSalesOrder?: SalesOrder | null;
  challanNo?: string | null;
  gstType?: string | null;
  lrNo?: string | null;
  hasteGstin?: string | null;
  vehicleNo?: string | null;
  dhara?: number | null;
  grace?: number | null;
  screenSeries?: string | null;
  createdAt: string;
  customer?: Customer | null;
  design?: TextileDesign;
  shareLink?: ShareLink;
}

export interface SalesLineItem {
  lineNo?: number;
  sourceLineNo?: number;
  itemMasterId?: string | null;
  itemName: string;
  bundles: number;
  mainScreen: string;
  screenName?: string | null;
  packing: string;
  unit: string;
  pcs: number;
  cut: number;
  mtsQty: number;
  rate: number;
  amount: number;
  rd?: number;
  discountPercent?: number;
  discountAmount?: number;
  manualAddLess?: number;
  gstRate?: number;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
  taxAmount?: number;
  taxableAmount?: number;
  totalAmount?: number;
  hsnCode?: string | null;
  soldPcs?: number;
  soldMts?: number;
  pendingPcs?: number;
  pendingMts?: number;
}

export interface SalesOrder {
  id: string;
  userId: string;
  customerId?: string | null;
  customer?: Customer | null;
  companyName?: string | null;
  partyName: string;
  partyGstin?: string | null;
  state?: string | null;
  station?: string | null;
  brokerName?: string | null;
  transportName?: string | null;
  vehicleNo?: string | null;
  lrNo?: string | null;
  challanNo?: string | null;
  gstType?: string | null;
  hasteGstin?: string | null;
  dhara?: number | null;
  grace?: number | null;
  screenSeries?: string | null;
  orderNo: number;
  orderDate: string;
  expectedDate?: string | null;
  haste?: string | null;
  remarks?: string | null;
  hsnCode?: string | null;
  lineItems: SalesLineItem[];
  pendingLines?: SalesLineItem[];
  totalBundles: number;
  totalPcs: number;
  totalMts: number;
  soldPcs?: number;
  soldMts?: number;
  pendingPcs?: number;
  pendingMts?: number;
  grossAmount: number;
  discountAmount: number;
  taxableAmount: number;
  totalTaxAmount: number;
  netAmount: number;
  status: 'open' | 'partial' | 'closed' | string;
  createdAt: string;
  updatedAt: string;
}

export interface SalesItemMaster {
  id: string;
  userId: string;
  name: string;
  mainScreen: string;
  packing?: string | null;
  cut: number;
  greyQuality?: string | null;
  finishType?: string | null;
  itemType?: string | null;
  screenSeries?: string | null;
  category?: string | null;
  unit?: string | null;
  sellingRate: number;
  rate2: number;
  rate3: number;
  workCut: number;
  hsnSac?: string | null;
  gstRate: number;
  remark?: string | null;
  createdAt: string;
  updatedAt: string;
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
  panNumber?: string | null;
  mobileNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  msmeType?: string | null;
  udyamNumber?: string | null;
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

export interface GreyTakaDetailRow {
  srNo: number;
  mts: number;
}

export interface MillReceiptTakaRow {
  srNo: number;
  greyMts: number;
  recMts: number;
  shortMts?: number;
  shortPct?: number;
}

export interface GreyPurchaseLine {
  quality?: string | null;
  taka?: number;
  mts?: number;
  rate?: number;
  grossAmount?: number;
  netAmount?: number;
  remark?: string | null;
}

export interface GreyPurchase {
  id: string;
  userId: string;
  supplierId?: string | null;
  supplier?: Supplier | null;
  companyName?: string | null;
  partyName: string;
  partyGstin?: string | null;
  partyMsme?: string | null;
  quality?: string | null;
  srNo?: number | null;
  orderNo?: string | null;
  hsnCode?: string | null;
  billNo?: string | null;
  brokerName?: string | null;
  billDate: string;
  checkerName?: string | null;
  transactionType: string;
  typeBillNumber?: number | null;
  recTaka: number;
  recMts: number;
  purRate: number;
  takaDetails?: GreyTakaDetailRow[] | null;
  lineItems: GreyPurchaseLine[];
  grossAmount: number;
  discountPercent: number;
  discountAmount: number;
  taxableAmount: number;
  otherAddBefore: number;
  otherLessBefore: number;
  placeOfSupply?: string | null;
  stateCode?: string | null;
  gstType?: string | null;
  gstRate: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTaxAmount: number;
  payableAmount: number;
  otherAddAfter: number;
  otherLessAfter: number;
  netAmount: number;
  paid: boolean;
  paidDate?: string | null;
  despatchMts: number;
  remarks?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface GreyReceiptSummary {
  id: string;
  srNo?: number | null;
  billNo?: string | null;
  billDate: string;
  partyName: string;
  quality?: string | null;
  brokerName?: string | null;
  purRate: number;
  recTaka: number;
  recMts: number;
  despatchMts: number;
  stockMts: number;
  orderNo?: string | null;
  remarks?: string | null;
  checkerName?: string | null;
  companyName?: string | null;
  returnedLotNo?: string | null;
  returnedMts?: number | null;
  returnedTaka?: number | null;
  returnedDate?: string | null;
  returnedFromMill?: string | null;
}

export interface GreyDispatch {
  id: string;
  userId: string;
  greyPurchaseId: string;
  greyPurchase?: GreyPurchase | null;
  companyName?: string | null;
  transactionType: string;
  challanNo?: string | null;
  dispatchDate: string;
  millLotNo?: string | null;
  purSr?: number | null;
  millName: string;
  ourMarka?: string | null;
  purBillNo?: string | null;
  purDate?: string | null;
  weaverName?: string | null;
  quality?: string | null;
  cut: number;
  weight: number;
  rate: number;
  despTaka: number;
  despMts: number;
  takaDetails?: GreyTakaDetailRow[] | null;
  remark?: string | null;
  brokerName?: string | null;
  orderNo?: string | null;
  checkerName?: string | null;
  vehicleNo?: string | null;
  ewayBillNo?: string | null;
  srNo?: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface MillPendingDispatch {
  id: string;
  greyPurchaseId: string;
  srNo?: number | null;
  challanNo?: string | null;
  dispatchDate: string;
  millName: string;
  millLotNo?: string | null;
  purSr?: number | null;
  quality?: string | null;
  weaverName?: string | null;
  brokerName?: string | null;
  ourMarka?: string | null;
  rate: number;
  despTaka: number;
  despMts: number;
  pendingTaka: number;
  pendingMts: number;
  receivedMts: number;
  takaDetails?: MillReceiptTakaRow[];
  greyPurchase?: { id: string; srNo?: number | null; billNo?: string | null; partyName?: string | null } | null;
}

export interface MillReceipt {
  id: string;
  userId: string;
  greyDispatchId: string;
  greyDispatch?: GreyDispatch | null;
  greyPurchaseId?: string | null;
  greyPurchase?: GreyPurchase | null;
  companyName?: string | null;
  millName: string;
  millGstin?: string | null;
  partyMsme?: string | null;
  entryType: string;
  processType?: string | null;
  hsnCode?: string | null;
  voucherNo?: number | null;
  receiptDate: string;
  billNo?: string | null;
  placeOfSupply?: string | null;
  stateCode?: string | null;
  gstType?: string | null;
  lotNo: string;
  despNo?: string | null;
  recChallan?: string | null;
  marka?: string | null;
  quality?: string | null;
  printStyle?: string | null;
  recTaka: number;
  recMts: number;
  greyMts: number;
  shortMts: number;
  shortPct: number;
  jobRate: number;
  jobAmount: number;
  rdPerMtr: number;
  rdLessAddAmt: number;
  discountPercent: number;
  discountAmount: number;
  otherLess: number;
  otherAdd: number;
  taxableAmount: number;
  gstRate: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  grossAmount: number;
  invoiceValue: number;
  tdsOnAmt: number;
  tdsPercent: number;
  tdsAmount: number;
  netAfterTds: number;
  remarks?: string | null;
  takaDetails?: MillReceiptTakaRow[] | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface GreyPurchaseReturn {
  id: string;
  userId: string;
  greyPurchaseId: string;
  greyPurchase?: GreyPurchase | null;
  greyDispatchId?: string | null;
  companyName?: string | null;
  entryType: string;
  greyType: string;
  voucherNo?: number | null;
  saleAccount: string;
  purSr?: number | null;
  quality?: string | null;
  hsnCode?: string | null;
  partyName: string;
  partyGstin?: string | null;
  placeOfSupply?: string | null;
  stateCode?: string | null;
  gstType?: string | null;
  billNo?: string | null;
  returnDate: string;
  refBillNo?: string | null;
  refBillDate?: string | null;
  brokerName?: string | null;
  challanNo?: string | null;
  station?: string | null;
  transport?: string | null;
  vehicleNo?: string | null;
  ewayBillNo?: string | null;
  lrNo?: string | null;
  checkerName?: string | null;
  pcs: number;
  mts: number;
  rate: number;
  grossAmount: number;
  discountPercent: number;
  discountAmount: number;
  otherLess: number;
  otherAdd: number;
  taxableAmount: number;
  gstRate: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  netAmount: number;
  paidAmount: number;
  paid: boolean;
  adjustBillNo?: string | null;
  remarks?: string | null;
  takaDetails?: GreyTakaDetailRow[] | null;
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
  remarks?: string | null;
  debitAmount: number;
  creditAmount: number;
  runningBalance: number;
  balanceType: 'DR' | 'CR';
  lineCount?: number;
}

export interface AccountLedgerParty {
  partyType: 'customer' | 'supplier' | 'both' | string;
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
  canEdit?: boolean;
  editPath?: string;
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

export interface WorkLineItem {
  lineNo?: number;
  itemName: string;
  bundles?: number;
  jobType?: string | null;
  unit?: string | null;
  pcs: number;
  cut: number;
  mtsQty: number;
  plain?: number;
  sec?: number;
  lost?: number;
  lace?: number;
  fresh?: number;
  rate: number;
  amount: number;
  fabricRate?: number;
  taxableValue?: number;
  pendingPcs?: number;
  pendingMts?: number;
}

export interface WorkPendingDespatch {
  id: string;
  challanNo?: string | null;
  despatchDate?: string;
  partyName: string;
  partyGstin?: string | null;
  workType?: string | null;
  brokerName?: string | null;
  transactionType?: string;
  totalPcs: number;
  totalMts: number;
  receivedPcs: number;
  receivedMts: number;
  pendingPcs: number;
  pendingMts: number;
  lineItems?: WorkLineItem[];
  pendingLines?: WorkLineItem[];
}

export interface WorkDespatch {
  id: string;
  userId: string;
  companyName?: string | null;
  transactionType: string;
  partyName: string;
  partyGstin?: string | null;
  placeOfSupply?: string | null;
  stateCode?: string | null;
  gstType?: string | null;
  challanNo?: string | null;
  despatchDate: string;
  brokerName?: string | null;
  vehicleNo?: string | null;
  workType?: string | null;
  hsnCode?: string | null;
  remarks?: string | null;
  receivedBy?: string | null;
  deliveryDays?: number;
  deliveryDueDate?: string | null;
  lrNo?: string | null;
  ewayBillNo?: string | null;
  rateInChallan?: boolean;
  lineItems: WorkLineItem[];
  totalBundles: number;
  totalPcs: number;
  totalMts: number;
  totalAmount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkReceipt {
  id: string;
  userId: string;
  workDespatchId: string;
  workDespatch?: WorkDespatch | null;
  companyName?: string | null;
  transactionType: string;
  partyName: string;
  partyGstin?: string | null;
  placeOfSupply?: string | null;
  stateCode?: string | null;
  gstType?: string | null;
  challanNo?: string | null;
  voucherNo?: number | null;
  receiptDate: string;
  brokerName?: string | null;
  workType?: string | null;
  hsnCode?: string | null;
  remarks?: string | null;
  billNo?: string | null;
  lineItems: WorkLineItem[];
  totalPcs: number;
  totalMts: number;
  totalFresh?: number;
  grossAmount?: number;
  discountPercent?: number;
  discountAmount?: number;
  otherLess?: number;
  otherAdd?: number;
  taxableAmount: number;
  gstRate: number;
  cgstRate?: number;
  cgstAmount: number;
  sgstRate?: number;
  sgstAmount: number;
  igstRate?: number;
  igstAmount: number;
  invoiceValue: number;
  tdsOnAmt?: number;
  tdsPercent?: number;
  tdsAmount?: number;
  netAfterTds?: number;
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
