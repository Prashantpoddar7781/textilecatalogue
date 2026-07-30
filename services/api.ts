import { AccountLedgerEntry, AccountLedgerParty, BankEntry, BankPendingBill, BusinessProfile, CompletedOrderParty, Contact, Customer, CreditDebitNote, ErpAccessLevel, ErpSession, ErpUserAccount, GreyDispatch, GreyPurchase, GreyPurchaseReturn, GreyReceiptSummary, GreyTakaDetailRow, LedgerEntryDetail, MillPendingDispatch, MillReceipt, MillReceiptTakaRow, Order, PurchaseBill, PurchaseBillExtraction, PurchaseBillParty, SalesInvoice, Supplier, SupplierLedgerEntry } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://textilecatalogue-production.up.railway.app/api';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('auth_token');
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    if (response.status === 402 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('subscription-required', { detail: error }));
    }
    throw new ApiError(
      response.status,
      response.status === 404 && (error.error === 'Route not found' || error.message === 'Route not found')
        ? 'Backend API route missing. Redeploy the Railway backend service, wait 1–2 minutes, then refresh.'
        : (error.error || error.message || 'Request failed')
    );
  }

  return response.json();
}

// Auth API
export const authApi = {
  register: async (email: string, password: string, name?: string, firmName?: string) => {
    return request<{ user: any; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, firmName }),
    });
  },

  login: async (email: string, password: string) => {
    return request<{ user: any; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  getCurrentUser: async () => {
    return request<{ user: any }>('/auth/me');
  },

  requestOtp: async (email: string, purpose: 'login' | 'reset') => {
    return request<{ ok: boolean; message: string }>('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ email, purpose }),
    });
  },

  verifyOtp: async (email: string, purpose: 'login' | 'reset', otp: string) => {
    return request<{ user?: any; token?: string; resetToken?: string }>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, purpose, otp }),
    });
  },

  resetPassword: async (resetToken: string, password: string) => {
    return request<{ ok: boolean }>('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ resetToken, password }),
    });
  },
};

// Account API
export const usersApi = {
  deleteAccount: async () => {
    return request<{ ok: boolean }>('/users/me', {
      method: 'DELETE',
    });
  },
};

// Designs API
export const designsApi = {
  getAll: async (params?: {
    fabric?: string;
    catalogue?: string;
    minPrice?: number;
    maxPrice?: number;
    search?: string;
    sortBy?: string;
    page?: number;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }
    const query = queryParams.toString();
    return request<{ designs: any[]; pagination: any }>(`/designs${query ? `?${query}` : ''}`);
  },

  getById: async (id: string) => {
    return request<any>(`/designs/${id}`);
  },
  getPublicById: async (id: string) => {
    return request<any>(`/designs/public/${id}`);
  },

  create: async (design: {
    name: string;
    image: string;
    designCode?: string;
    color?: string;
    stockQuantity?: number;
    stockUnit?: 'pcs' | 'mtrs';
    pcsPerParcel?: number;
    moq?: number;
    basePrice: number;
    additionalPrices?: Array<{
      name: string;
      type: 'percentage' | 'fixed';
      value: number;
      calculatedPrice?: number;
    }>;
    fabric: string;
    description?: string;
    catalogueId?: string;
    aiModels?: string[];
    costingDetails?: any;
  }) => {
    return request<any>('/designs', {
      method: 'POST',
      body: JSON.stringify(design),
    });
  },

  update: async (id: string, design: Partial<{
    name?: string;
    image?: string;
    designCode?: string;
    color?: string;
    stockQuantity?: number;
    stockUnit?: 'pcs' | 'mtrs';
    pcsPerParcel?: number;
    moq?: number;
    basePrice?: number;
    additionalPrices?: Array<{
      name: string;
      type: 'percentage' | 'fixed';
      value: number;
      calculatedPrice?: number;
    }>;
    fabric?: string;
    description?: string;
    catalogueId?: string;
    aiModels?: string[];
    costingDetails?: any;
  }>) => {
    return request<any>(`/designs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(design),
    });
  },

  delete: async (id: string) => {
    return request<{ message: string }>(`/designs/${id}`, {
      method: 'DELETE',
    });
  },

  getFabrics: async () => {
    return request<{ fabrics: string[] }>('/designs/meta/fabrics');
  },

  getCatalogues: async () => {
    return request<{ catalogues: any[] }>('/designs/meta/catalogues');
  },
};

// Catalogues API
export const cataloguesApi = {
  getAll: async () => {
    return request<{ catalogues: any[] }>('/catalogues');
  },

  create: async (name: string) => {
    return request<any>('/catalogues', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  getById: async (id: string) => {
    return request<any>(`/catalogues/${id}`);
  },

  update: async (id: string, name: string) => {
    return request<any>(`/catalogues/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  },

  delete: async (id: string) => {
    return request<{ message: string }>(`/catalogues/${id}`, {
      method: 'DELETE',
    });
  },
};

// Contacts API
export const contactsApi = {
  getAll: async () => {
    return request<Contact[]>('/contacts');
  },

  getByStatus: async (status: 'delivered' | 'undelivered' | 'unknown') => {
    return request<Contact[]>(`/contacts/status/${status}`);
  },

  create: async (contact: { name: string; phoneNumber: string; isSaved?: boolean }) => {
    return request<Contact>('/contacts', {
      method: 'POST',
      body: JSON.stringify(contact),
    });
  },

  update: async (id: string, contact: { 
    name?: string; 
    phoneNumber?: string; 
    isSaved?: boolean;
    deliveryStatus?: 'delivered' | 'undelivered' | 'unknown';
    lastShared?: number;
  }) => {
    return request<Contact>(`/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(contact),
    });
  },

  delete: async (id: string) => {
    return request<{ message: string }>(`/contacts/${id}`, {
      method: 'DELETE',
    });
  },

  updateDeliveryStatus: async (contacts: { id: string; deliveryStatus: 'delivered' | 'undelivered' | 'unknown' }[]) => {
    return request<{ message: string }>('/contacts/update-delivery-status', {
      method: 'POST',
      body: JSON.stringify({ contacts }),
    });
  },
};

// Customers API
export const customersApi = {
  getAll: async () => {
    return request<{ customers: Customer[] }>('/customers');
  },

  create: async (customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>) => {
    return request<{ customer: Customer }>('/customers', {
      method: 'POST',
      body: JSON.stringify(customer),
    });
  },
};

// Share Links API
export const shareLinksApi = {
  create: async (data: {
    designId?: string;
    designIds?: string[];
    expiresAt?: string;
    selectedPriceType?: string;
    securityMode?: 'normal' | 'device_locked';
  }) => {
    return request<any>('/share-links', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  createCollection: async (data?: {
    expiresAt?: string;
    selectedPriceType?: string;
    securityMode?: 'normal' | 'device_locked';
  }) => {
    return request<any>('/share-links/collection', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  },

  getAll: async () => {
    return request<{ shareLinks: any[] }>('/share-links');
  },

  getByToken: async (token: string, deviceToken?: string) => {
    const query = deviceToken ? `?deviceToken=${encodeURIComponent(deviceToken)}` : '';
    return request<any>(`/share-links/${token}${query}`);
  },

  /** Record that someone opened the shared page (public, no auth). Call once per session. */
  recordOpen: async (token: string, sessionId?: string) => {
    return request<{ ok: boolean }>(`/share-links/${token}/open`, {
      method: 'POST',
      body: JSON.stringify({ sessionId: sessionId ?? null }),
    });
  },

  /** Record that a design was viewed on the share page (public, no auth). Call once per design per session. */
  recordDesignView: async (token: string, designId: string, sessionId?: string) => {
    return request<{ ok: boolean }>(`/share-links/${token}/view`, {
      method: 'POST',
      body: JSON.stringify({ designId, sessionId: sessionId ?? null }),
    });
  },

  /** Get analytics for the current user's share links (auth required). */
  getStats: async () => {
    return request<{
      totalOpens: number;
      mostViewedDesigns: { designId: string; viewCount: number; design: { id: string; name: string | null; image: string; fabric: string } | null }[];
      linksWithOpens: { id: string; token: string; openCount: number }[];
    }>('/share-links/stats');
  },

  disable: async (id: string) => {
    return request<{ message: string; shareLink: any }>(`/share-links/${id}/disable`, {
      method: 'PUT',
    });
  },

  enable: async (id: string) => {
    return request<{ message: string; shareLink: any }>(`/share-links/${id}/enable`, {
      method: 'PUT',
    });
  },

  delete: async (id: string) => {
    return request<{ message: string }>(`/share-links/${id}`, {
      method: 'DELETE',
    });
  },
};

// Orders API
export const ordersApi = {
  getAll: async () => {
    return request<{ orders: any[] }>('/orders');
  },
  getNextInvoiceNumber: async () => {
    return request<{ invoiceNumber: string }>('/orders/next-invoice-number');
  },
  createManual: async (body: {
    kind: 'open' | 'design';
    buyerName?: string;
    buyerPhone?: string;
    customerId?: string;
    customer?: {
      organizationName: string;
      gstNumber?: string;
      contactPersonName?: string;
      mobileNumber?: string;
      agentName?: string;
      category?: string;
      state?: string;
      city?: string;
      pincode?: string;
      discountRate?: number | null;
    };
    remarks?: string;
    priceCategory?: string;
    orderNumber?: string;
    transactionType?: string;
    agentName?: string;
    transportName?: string;
    discountRate?: number | null;
    shippingCharge?: number | null;
    orderDate?: string;
    expectedDate?: string;
    haste?: string;
    station?: string;
    parcelQuantity?: number;
    lines?: Array<{ designId: string; quantity: number; remarks?: string }>;
  }) => {
    return request<{ order?: any; orders?: any[]; manualBatchId?: string }>('/orders/manual', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },
  updateStatus: async (id: string, status: string) => {
    return request<{ order: any }>(`/orders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  },
  updateLineCompletion: async (id: string, lineIndex: number, completed: boolean) => {
    return request<{ order: any }>(`/orders/${id}/lines/${lineIndex}/completion`, {
      method: 'PUT',
      body: JSON.stringify({ completed }),
    });
  },
  update: async (id: string, body: {
    buyerName?: string;
    customerId?: string;
    customer?: {
      organizationName: string;
      gstNumber?: string;
      contactPersonName?: string;
      mobileNumber?: string;
      agentName?: string;
      category?: string;
      state?: string;
      city?: string;
      pincode?: string;
      discountRate?: number | null;
    };
    remarks?: string;
    priceCategory?: string;
    orderNumber?: string;
    agentName?: string;
    transportName?: string;
    haste?: string;
    station?: string;
    discountRate?: number | null;
    shippingCharge?: number | null;
    orderDate?: string;
    expectedDate?: string;
    lines?: Array<{ designId: string; quantity: number; remarks?: string }>;
  }) => {
    return request<{ order: any }>(`/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },
  createPublic: async (data: {
    token: string;
    designId: string;
    buyerName: string;
    buyerPhone?: string;
    orderSessionId?: string;
    quantity: number;
  }) => {
    return request<{ order: any }>('/orders/public', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Sales Invoices API
export const invoicesApi = {
  getProfile: async () => {
    return request<{ profile: BusinessProfile }>('/invoices/profile');
  },
  updateProfile: async (profile: Partial<BusinessProfile>) => {
    return request<{ profile: BusinessProfile }>('/invoices/profile', {
      method: 'PUT',
      body: JSON.stringify(profile)
    });
  },
  getAll: async () => {
    return request<{ invoices: SalesInvoice[] }>('/invoices');
  },
  getById: async (id: string) => {
    return request<{ invoice: SalesInvoice }>(`/invoices/${id}`);
  },
  createFromOrder: async (orderId: string, body?: {
    invoiceDate?: string;
    defaultHsnCode?: string;
    defaultGstRate?: number;
    placeOfSupply?: string;
    notes?: string;
  }) => {
    return request<{ invoice: SalesInvoice; existing: boolean }>(`/invoices/from-order/${orderId}`, {
      method: 'POST',
      body: JSON.stringify(body || {})
    });
  },
};

// Purchase OCR / Supplier Ledger API
export const purchasesApi = {
  extractBill: async (imageDataUrl: string) => {
    return request<{ extraction: PurchaseBillExtraction }>('/purchases/extract', {
      method: 'POST',
      body: JSON.stringify({ imageDataUrl })
    });
  },
  saveBill: async (extraction: PurchaseBillExtraction, imageDataUrl?: string | null, transactionType?: string) => {
    return request<{ supplier: Supplier; bill: PurchaseBill }>('/purchases/bills', {
      method: 'POST',
      body: JSON.stringify({ extraction, imageDataUrl, transactionType })
    });
  },
  getSuppliers: async () => {
    return request<{ suppliers: Supplier[] }>('/purchases/suppliers');
  },
  getSupplierLedger: async (supplierId: string) => {
    return request<{ supplier: Supplier; ledger: SupplierLedgerEntry[]; runningBalance: number }>(`/purchases/suppliers/${supplierId}/ledger`);
  },
  getBill: async (billId: string) => {
    return request<{ bill: PurchaseBill }>(`/purchases/bills/${billId}`);
  },
};

// ERP Sales / Purchase entries
export const erpApi = {
  createSalesEntry: async (body: {
    transactionType?: string;
    customerId?: string;
    buyerName?: string;
    orderDate?: string;
    orderNumber?: string;
    agentName?: string;
    transportName?: string;
    state?: string;
    remarks?: string;
    taxableAmount?: number;
    totalTaxAmount?: number;
    grandTotal: number;
    lineItems?: Array<{ description?: string; quantity?: number; rate?: number; amount?: number }>;
  }) => {
    return request<{ order: Order }>('/orders/erp-sales', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }
};

// Account Ledger API
export const ledgerApi = {
  getParties: async (partyType: 'customer' | 'supplier') => {
    return request<{ partyType: string; parties: AccountLedgerParty[] }>(`/ledger/parties?partyType=${partyType}`);
  },
  getCustomerLedger: async (partyName: string) => {
    return request<{
      partyType: string;
      partyName: string;
      ledger: AccountLedgerEntry[];
      runningBalance: number;
      balanceType: 'DR' | 'CR';
      totalDebit: number;
      totalCredit: number;
    }>(`/ledger/customer?partyName=${encodeURIComponent(partyName)}`);
  },
  getSupplierLedger: async (supplierId: string) => {
    return request<{
      partyType: string;
      partyName: string;
      supplierId: string;
      ledger: AccountLedgerEntry[];
      runningBalance: number;
      balanceType: 'DR' | 'CR';
      totalDebit: number;
      totalCredit: number;
    }>(`/ledger/supplier/${supplierId}`);
  },
  getEntryDetail: async (sourceType: string, sourceId: string) => {
    return request<{ detail: LedgerEntryDetail }>(`/ledger/entry/${sourceType}/${sourceId}`);
  }
};

// ERP Users / Auth API
export const erpUsersApi = {
  getAll: async () => {
    return request<{ users: ErpUserAccount[] }>('/erp-users');
  },
  getCount: async () => {
    return request<{ count: number }>('/erp-users/count');
  },
  create: async (body: { name: string; password: string; accessLevel: ErpAccessLevel }) => {
    return request<{ user: ErpUserAccount }>('/erp-users', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },
  update: async (id: string, body: { name?: string; password?: string; accessLevel?: ErpAccessLevel; isActive?: boolean }) => {
    return request<{ user: ErpUserAccount }>(`/erp-users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },
  delete: async (id: string) => {
    return request<{ success: boolean }>(`/erp-users/${id}`, { method: 'DELETE' });
  }
};

export const erpAuthApi = {
  getStatus: async () => {
    return request<{
      requiresLogin: boolean;
      userCount: number;
      currentAccountingYear: string;
      accountingYears: string[];
    }>('/erp-auth/status');
  },
  login: async (body: { name: string; password: string; accountingYear?: string }) => {
    return request<{ session: ErpSession }>('/erp-auth/login', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }
};

// Bank Payment / Receipts API
export const bankEntriesApi = {
  getTransactionTypes: async () => {
    return request<{ types: Array<{ value: string; label: string; category: string }> }>('/bank-entries/transaction-types');
  },
  getNextTypeBillNumber: async (params: { transactionType: string; source?: 'order' | 'purchase_bill' }) => {
    const queryParams = new URLSearchParams();
    queryParams.set('transactionType', params.transactionType);
    if (params.source) queryParams.set('source', params.source);
    return request<{ transactionType: string; typeBillNumber: number }>(`/bank-entries/next-type-bill-number?${queryParams.toString()}`);
  },
  getNextVoucher: async () => {
    return request<{ voucherNumber: string; companyName: string }>('/bank-entries/next-voucher');
  },
  getBalances: async (params: { bankName?: string; partyName?: string; partyType?: 'customer' | 'supplier' | 'other' }) => {
    const queryParams = new URLSearchParams();
    if (params.bankName) queryParams.set('bankName', params.bankName);
    if (params.partyName) queryParams.set('partyName', params.partyName);
    if (params.partyType) queryParams.set('partyType', params.partyType);
    const query = queryParams.toString();
    return request<{ bankBalance: number; partyBalance: number }>(`/bank-entries/balances${query ? `?${query}` : ''}`);
  },
  getPendingBills: async (params: { partyName: string; partyType?: 'customer' | 'supplier' | 'other'; transactionType?: string }) => {
    const queryParams = new URLSearchParams();
    queryParams.set('partyName', params.partyName);
    if (params.partyType) queryParams.set('partyType', params.partyType);
    if (params.transactionType) queryParams.set('transactionType', params.transactionType);
    return request<{ bills: BankPendingBill[]; notes?: BankPendingBill[]; noteCount?: number; billCount?: number }>(`/bank-entries/pending-bills?${queryParams.toString()}`);
  },
  getBankAccounts: async () => {
    return request<{ accounts: Array<{ name: string; balance: number }> }>('/bank-entries/bank-accounts');
  },
  getCompletedOrderParties: async () => {
    return request<{ parties: CompletedOrderParty[] }>('/bank-entries/completed-order-parties');
  },
  getPurchaseBillParties: async () => {
    return request<{ parties: PurchaseBillParty[] }>('/bank-entries/purchase-bill-parties');
  },
  getAll: async (params?: { search?: string; entryType?: 'all' | 'payment' | 'receipt' }) => {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.set('search', params.search);
    if (params?.entryType && params.entryType !== 'all') queryParams.set('entryType', params.entryType);
    const query = queryParams.toString();
    return request<{ entries: BankEntry[] }>(`/bank-entries${query ? `?${query}` : ''}`);
  },
  create: async (entry: Omit<BankEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    return request<{ entry: BankEntry }>('/bank-entries', {
      method: 'POST',
      body: JSON.stringify(entry)
    });
  },
  update: async (id: string, entry: Partial<BankEntry>) => {
    return request<{ entry: BankEntry }>(`/bank-entries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(entry)
    });
  },
  delete: async (id: string) => {
    return request<{ ok: boolean }>(`/bank-entries/${id}`, {
      method: 'DELETE'
    });
  },
};

export const creditDebitNotesApi = {
  getTypes: async () => {
    return request<{ types: Array<{ value: string; label: string; noteKind: string; noteSide: string; partyType: string }> }>('/credit-debit-notes/types');
  },
  getNextVoucher: async (noteType: string) => {
    return request<{ voucherNumber: number; companyName: string; businessState: string; noteType: any }>(`/credit-debit-notes/next-voucher?noteType=${encodeURIComponent(noteType)}`);
  },
  calculate: async (body: Record<string, unknown>) => {
    return request<{ totals: Record<string, number | string>; businessState: string }>('/credit-debit-notes/calculate', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },
  getAll: async (noteType?: string) => {
    const query = noteType ? `?noteType=${encodeURIComponent(noteType)}` : '';
    return request<{ notes: CreditDebitNote[] }>(`/credit-debit-notes${query}`);
  },
  create: async (body: Record<string, unknown>) => {
    return request<{ note: CreditDebitNote }>('/credit-debit-notes', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },
  delete: async (id: string) => {
    return request<{ success: boolean }>(`/credit-debit-notes/${id}`, { method: 'DELETE' });
  }
};

export const greyPurchasesApi = {
  getMeta: async () => {
    return request<{
      companyName: string;
      businessState: string;
      businessGstin: string;
      defaultHsnCode: string;
      defaultGstRate: number;
      nextSrNo: number;
      states: string[];
      stateCodes: Array<{ code: string; name: string }>;
    }>('/grey-purchases/meta');
  },
  calculate: async (body: Record<string, unknown>) => {
    return request<{ totals: Record<string, number | string> }>('/grey-purchases/calculate', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },
  getAll: async () => {
    return request<{ entries: GreyPurchase[] }>('/grey-purchases');
  },
  getGodownInventory: async (filter = 'all') => {
    const query = filter && filter !== 'all' ? `?filter=${encodeURIComponent(filter)}` : '';
    return request<{
      filter: string;
      rows: Array<{
        id: string;
        date: string;
        srNo?: number | null;
        billNo?: string | null;
        partyName: string;
        brokerName?: string | null;
        quality?: string | null;
        taka: number;
        mts: number;
        despatchTaka: number;
        despatchMts: number;
        stockTaka: number;
        rate: number;
        grossAmount: number;
        payableAmount: number;
        netAmount: number;
        stockMts: number;
        sourceType: string;
        sourceLabel: string;
        godown: string;
      }>;
      groups: Array<{
        key: string;
        label: string;
        rows: Array<{
          id: string;
          date: string;
          srNo?: number | null;
          billNo?: string | null;
          partyName: string;
          brokerName?: string | null;
          quality?: string | null;
          taka: number;
          mts: number;
          despatchTaka: number;
          despatchMts: number;
          stockTaka: number;
          rate: number;
          grossAmount: number;
          payableAmount: number;
          netAmount: number;
          stockMts: number;
          sourceType: string;
          sourceLabel: string;
          godown: string;
        }>;
        totals: {
          taka: number;
          mts: number;
          grossAmount: number;
          payableAmount: number;
          netAmount: number;
          stockMts: number;
          entries: number;
        };
      }>;
      summary: Array<{
        quality: string;
        taka: number;
        mts: number;
        grossAmount: number;
        netAmount: number;
        entries: number;
      }>;
      totals: {
        taka: number;
        mts: number;
        despatchTaka: number;
        stockTaka: number;
        grossAmount: number;
        payableAmount: number;
        netAmount: number;
        stockMts: number;
        entries: number;
      };
    }>(`/grey-purchases/godown-inventory${query}`);
  },
  getById: async (id: string) => {
    return request<{
      entry: GreyPurchase;
      dispatches: GreyDispatch[];
      stockSummary: {
        recTaka: number;
        recMts: number;
        despatchTaka: number;
        despatchMts: number;
        stockTaka: number;
        stockMts: number;
      };
    }>(`/grey-purchases/${id}`);
  },
  create: async (body: Record<string, unknown>) => {
    return request<{ entry: GreyPurchase }>('/grey-purchases', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },
  update: async (id: string, body: Record<string, unknown>) => {
    return request<{ entry: GreyPurchase }>(`/grey-purchases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }
};

export const greyDispatchesApi = {
  getMeta: async () => {
    return request<{
      companyName: string;
      nextSrNo: number;
      nextChallanNo: number;
      transactionTypes: string[];
      mills: string[];
    }>('/grey-dispatches/meta');
  },
  getGreyReceipts: async (purSr?: number | string, opts?: { transactionType?: string }) => {
    const query = new URLSearchParams();
    if (purSr != null && String(purSr).trim() !== '') query.set('purSr', String(purSr));
    if (opts?.transactionType) query.set('transactionType', opts.transactionType);
    const qs = query.toString();
    return request<{ entries: GreyReceiptSummary[]; transactionType?: string }>(
      `/grey-dispatches/grey-receipts${qs ? `?${qs}` : ''}`
    );
  },
  getAvailableTakas: async (greyPurchaseId: string, opts?: { transactionType?: string }) => {
    const query = new URLSearchParams();
    if (opts?.transactionType) query.set('transactionType', opts.transactionType);
    const qs = query.toString();
    return request<{
      purchase: GreyReceiptSummary;
      availableRows: GreyTakaDetailRow[];
      dispatchedSrNos: number[];
      transactionType?: string;
    }>(`/grey-dispatches/grey-receipts/${greyPurchaseId}/available-takas${qs ? `?${qs}` : ''}`);
  },
  getAll: async () => {
    return request<{ entries: GreyDispatch[] }>('/grey-dispatches');
  },
  getById: async (id: string) => {
    return request<{ entry: GreyDispatch }>(`/grey-dispatches/${id}`);
  },
  getMillDispatchReport: async (filter = 'all') => {
    const query = filter && filter !== 'all' ? `?filter=${encodeURIComponent(filter)}` : '';
    return request<{
      filter: string;
      companyName: string;
      reportDate: string;
      rows: Array<{
        id: string;
        greyPurchaseId: string;
        date: string;
        srNo?: number | null;
        challanNo?: string | null;
        purSr?: number | null;
        millName: string;
        weaverName?: string | null;
        brokerName?: string | null;
        quality?: string | null;
        taka: number;
        mts: number;
        balTaka: number;
        balMts: number;
        rate: number;
        balAmount: number;
        dispatchAmount: number;
        remark?: string | null;
        vehicleNo?: string | null;
        ewayBillNo?: string | null;
        transactionType?: string | null;
      }>;
      groups: Array<{
        key: string;
        label: string;
        rows: Array<{
          id: string;
          greyPurchaseId: string;
          date: string;
          srNo?: number | null;
          challanNo?: string | null;
          purSr?: number | null;
          millName: string;
          weaverName?: string | null;
          brokerName?: string | null;
          quality?: string | null;
          taka: number;
          mts: number;
          balTaka: number;
          balMts: number;
          rate: number;
          balAmount: number;
          dispatchAmount: number;
        }>;
        totals: {
          taka: number;
          mts: number;
          balTaka: number;
          balMts: number;
          balAmount: number;
          entries: number;
        };
      }>;
      millSegments: Array<{
        millName: string;
        qualities: Array<{
          quality: string;
          taka: number;
          mts: number;
          balTaka: number;
          balMts: number;
          balAmount: number;
          rate: number;
          entries: number;
        }>;
        subtotal: {
          taka: number;
          mts: number;
          balTaka: number;
          balMts: number;
          balAmount: number;
          rate: number;
          entries: number;
        };
      }>;
      summary: Array<{
        mill: string;
        taka: number;
        mts: number;
        balAmount: number;
        entries: number;
      }>;
      totals: {
        taka: number;
        mts: number;
        balTaka: number;
        balMts: number;
        balAmount: number;
        rate: number;
        entries: number;
      };
    }>(`/grey-dispatches/mill-dispatch-report${query}`);
  },
  create: async (body: Record<string, unknown>) => {
    return request<{ entry: GreyDispatch }>('/grey-dispatches', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }
};

export const greyPurchaseReturnsApi = {
  getMeta: async () => {
    return request<{
      companyName: string;
      businessState: string;
      defaultHsnCode: string;
      defaultGstRate: number;
      nextVoucherNo: number;
      nextChallanNo: number;
      entryTypes: string[];
      greyTypes: string[];
      saleAccounts: string[];
      states: string[];
    }>('/grey-purchase-returns/meta');
  },
  calculate: async (body: Record<string, unknown>) => {
    return request<{ totals: Record<string, number | string> }>('/grey-purchase-returns/calculate', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },
  getAll: async () => {
    return request<{ entries: GreyPurchaseReturn[] }>('/grey-purchase-returns');
  },
  getById: async (id: string) => {
    return request<{ entry: GreyPurchaseReturn }>(`/grey-purchase-returns/${id}`);
  },
  create: async (body: Record<string, unknown>) => {
    return request<{ entry: GreyPurchaseReturn }>('/grey-purchase-returns', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }
};

export const millReceiptsApi = {
  getMeta: async () => {
    return request<{
      companyName: string;
      businessState: string;
      defaultHsnCode: string;
      defaultGstRate: number;
      nextVoucherNo: number;
      entryTypes: string[];
      processTypes?: string[];
      defaultProcessType?: string;
      mills: string[];
      millParties?: Array<{
        name: string;
        gstNumber?: string | null;
        panNumber?: string | null;
        suggestedTdsPercent?: number | null;
      }>;
      states: string[];
    }>('/mill-receipts/meta');
  },
  calculate: async (body: Record<string, unknown>) => {
    return request<{ totals: Record<string, number | string> }>('/mill-receipts/calculate', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },
  getPendingDispatches: async (millName: string) => {
    return request<{ entries: MillPendingDispatch[] }>(
      `/mill-receipts/pending-dispatches?millName=${encodeURIComponent(millName)}`
    );
  },
  getAvailableTakas: async (dispatchId: string) => {
    return request<{
      dispatch: MillPendingDispatch;
      availableRows: MillReceiptTakaRow[];
      receivedSrNos: number[];
      receivedMts: number;
    }>(`/mill-receipts/pending-dispatches/${dispatchId}/available-takas`);
  },
  getAll: async () => {
    return request<{ entries: MillReceipt[] }>('/mill-receipts');
  },
  getById: async (id: string) => {
    return request<{ entry: MillReceipt }>(`/mill-receipts/${id}`);
  },
  getReport: async (params?: {
    filter?: string;
    millName?: string;
    fromDate?: string;
    toDate?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.filter) query.set('filter', params.filter);
    if (params?.millName) query.set('millName', params.millName);
    if (params?.fromDate) query.set('fromDate', params.fromDate);
    if (params?.toDate) query.set('toDate', params.toDate);
    const qs = query.toString();
    return request<{
      filter: string;
      companyName: string;
      millName?: string | null;
      fromDate?: string | null;
      toDate?: string | null;
      reportDate: string;
      rows: Array<Record<string, unknown>>;
      groups: Array<{
        key: string;
        label: string;
        rows: Array<Record<string, unknown>>;
        totals: Record<string, number>;
      }>;
      totals: Record<string, number>;
    }>(`/mill-receipts/report${qs ? `?${qs}` : ''}`);
  },
  create: async (body: Record<string, unknown>) => {
    return request<{ entry: MillReceipt }>('/mill-receipts', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },
  update: async (id: string, body: Record<string, unknown>) => {
    return request<{ entry: MillReceipt }>(`/mill-receipts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }
};

export const workDespatchesApi = {
  getMeta: async () => {
    return request<{
      companyName: string;
      nextChallanNo: number;
      nextSrNo: number;
      transactionTypes: string[];
      workTypes: string[];
      units: string[];
      defaultCut: number;
      parties: Array<{ name: string; gstNumber?: string | null; state?: string | null; brokerName?: string | null }>;
    }>('/work-despatches/meta');
  },
  getPending: async (partyName?: string) => {
    const qs = partyName ? `?partyName=${encodeURIComponent(partyName)}` : '';
    return request<{ entries: import('../types').WorkPendingDespatch[] }>(`/work-despatches/pending${qs}`);
  },
  getReport: async (params?: { fromDate?: string; toDate?: string; partyName?: string }) => {
    const query = new URLSearchParams();
    if (params?.fromDate) query.set('fromDate', params.fromDate);
    if (params?.toDate) query.set('toDate', params.toDate);
    if (params?.partyName) query.set('partyName', params.partyName);
    const qs = query.toString();
    return request<{
      companyName: string;
      fromDate?: string | null;
      toDate?: string | null;
      reportDate: string;
      rows: Array<Record<string, unknown>>;
      totals: { desPcs: number; desMts: number; pendingPcs: number; pendingMts: number };
    }>(`/work-despatches/report${qs ? `?${qs}` : ''}`);
  },
  create: async (body: Record<string, unknown>) => {
    return request<{ entry: import('../types').WorkDespatch }>('/work-despatches', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }
};

export const workReceiptsApi = {
  getMeta: async () => {
    return request<{
      companyName: string;
      businessState?: string | null;
      defaultGstRate: number;
      nextVoucherNo: number;
      transactionTypes: string[];
      states: string[];
    }>('/work-receipts/meta');
  },
  calculate: async (body: Record<string, unknown>) => {
    return request<{ totals: Record<string, number | string> }>('/work-receipts/calculate', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },
  getReport: async (params?: { fromDate?: string; toDate?: string; partyName?: string }) => {
    const query = new URLSearchParams();
    if (params?.fromDate) query.set('fromDate', params.fromDate);
    if (params?.toDate) query.set('toDate', params.toDate);
    if (params?.partyName) query.set('partyName', params.partyName);
    const qs = query.toString();
    return request<{
      companyName: string;
      rows: Array<Record<string, unknown>>;
      totals: { recPcs: number; recMts: number; taxableAmount: number; invoiceValue: number };
    }>(`/work-receipts/report${qs ? `?${qs}` : ''}`);
  },
  create: async (body: Record<string, unknown>) => {
    return request<{ entry: import('../types').WorkReceipt }>('/work-receipts', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }
};

// Billing API
export const billingApi = {
  getPlans: async () => {
    return request<{ plans: Array<{ id: string; name: string; price: number; currency: string; interval: string }> }>('/billing/plans');
  },
  getStatus: async () => {
    return request<{ subscription: any }>('/billing/status');
  },
  createRazorpaySubscription: async (plan: 'monthly' | 'annual') => {
    return request<{ subscriptionId: string; razorpayKeyId: string; plan: string; customerId: string; email: string }>(
      '/billing/razorpay/subscription',
      {
        method: 'POST',
        body: JSON.stringify({ plan })
      }
    );
  },
  cancelRazorpaySubscription: async () => {
    return request<{ subscription: any }>('/billing/razorpay/subscription/cancel', {
      method: 'POST'
    });
  },
  verifyGooglePlaySubscription: async (productId: string, purchaseToken: string) => {
    return request<{ subscription: any }>('/billing/google-play/subscription/verify', {
      method: 'POST',
      body: JSON.stringify({ productId, purchaseToken })
    });
  },
  getInvoices: async () => {
    return request<{ invoices: SubscriptionInvoice[] }>('/billing/invoices');
  },
  syncInvoices: async () => {
    return request<{ invoice: SubscriptionInvoice | null; invoices: SubscriptionInvoice[] }>('/billing/invoices/sync', {
      method: 'POST'
    });
  },
  downloadInvoice: async (invoiceId: string, invoiceNumber: string) => {
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new ApiError(response.status, error.error || error.message || 'Download failed');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${invoiceNumber}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
};

export interface SubscriptionInvoice {
  id: string;
  invoiceNumber: string;
  firmName?: string | null;
  plan: string;
  planName: string;
  amount: number;
  currency: string;
  billingPeriodStart?: string | null;
  billingPeriodEnd?: string | null;
  paymentSource: string;
  paidAt: string;
  createdAt: string;
}

export { ApiError };

