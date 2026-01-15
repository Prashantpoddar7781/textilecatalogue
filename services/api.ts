import { Contact } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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
    throw new ApiError(response.status, error.error || error.message || 'Request failed');
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

  create: async (design: {
    name: string;
    image: string;
    basePrice: number;
    additionalPrices?: Array<{ name: string; type: 'percentage' | 'fixed'; value: number }>;
    fabric: string;
    description?: string;
    catalogueId?: string;
  }) => {
    return request<any>('/designs', {
      method: 'POST',
      body: JSON.stringify(design),
    });
  },

  update: async (id: string, design: Partial<{
    name?: string;
    image?: string;
    basePrice?: number;
    additionalPrices?: Array<{ name: string; type: 'percentage' | 'fixed'; value: number }>;
    fabric?: string;
    description?: string;
    catalogueId?: string;
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

// Share Links API
export const shareLinksApi = {
  create: async (data: {
    designId?: string;
    designIds?: string[];
    expiresAt?: string;
    selectedPriceType?: string;
  }) => {
    return request<any>('/share-links', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  createCollection: async (data?: {
    expiresAt?: string;
    selectedPriceType?: string;
  }) => {
    return request<any>('/share-links/collection', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  },

  getAll: async () => {
    return request<{ shareLinks: any[] }>('/share-links');
  },

  getByToken: async (token: string) => {
    return request<any>(`/share-links/${token}`);
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
  createPublic: async (data: {
    token: string;
    designId: string;
    buyerName: string;
    buyerPhone: string;
    quantity: number;
  }) => {
    return request<{ order: any }>('/orders/public', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

export { ApiError };

