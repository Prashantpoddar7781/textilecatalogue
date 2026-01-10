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
    wholesalePrice: number;
    retailPrice: number;
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
    image: string;
    wholesalePrice: number;
    retailPrice: number;
    fabric: string;
    description: string;
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

export { ApiError };

