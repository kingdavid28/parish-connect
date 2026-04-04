import { ApiResponse, PaginatedResponse } from "../types";

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

// Allowed hostname derived from the configured base URL
const ALLOWED_HOSTNAME = (() => {
  try { return new URL(API_BASE_URL).hostname; } catch { return "localhost"; }
})();

function validateEndpoint(endpoint: string): void {
  // Only validate absolute URLs; relative endpoints are always safe
  if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) return;
  const { hostname } = new URL(endpoint);
  if (hostname !== ALLOWED_HOSTNAME) {
    throw new Error(`Untrusted host: ${hostname}`);
  }
}
const API_TIMEOUT = 30000; // 30 seconds

// API Error class
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Request interceptor type
type RequestInterceptor = (config: RequestInit) => RequestInit | Promise<RequestInit>;

// Response interceptor type
type ResponseInterceptor = (response: Response) => Response | Promise<Response>;

class ApiClient {
  private readonly baseURL: string;
  private readonly timeout: number;
  private readonly requestInterceptors: RequestInterceptor[] = [];
  private readonly responseInterceptors: ResponseInterceptor[] = [];

  constructor(baseURL: string, timeout: number) {
    this.baseURL = baseURL;
    this.timeout = timeout;
  }

  // Add request interceptor
  addRequestInterceptor(interceptor: RequestInterceptor) {
    this.requestInterceptors.push(interceptor);
  }

  // Add response interceptor
  addResponseInterceptor(interceptor: ResponseInterceptor) {
    this.responseInterceptors.push(interceptor);
  }

  // Apply request interceptors
  private async applyRequestInterceptors(config: RequestInit): Promise<RequestInit> {
    let modifiedConfig = config;
    for (const interceptor of this.requestInterceptors) {
      modifiedConfig = await interceptor(modifiedConfig);
    }
    return modifiedConfig;
  }

  // Apply response interceptors
  private async applyResponseInterceptors(response: Response): Promise<Response> {
    let modifiedResponse = response;
    for (const interceptor of this.responseInterceptors) {
      modifiedResponse = await interceptor(modifiedResponse);
    }
    return modifiedResponse;
  }

  // Main request method
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      // Build config
      let config: RequestInit = {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      };

      // Apply request interceptors
      config = await this.applyRequestInterceptors(config);

      // Validate endpoint before request
      validateEndpoint(endpoint);

      // Make request
      let response = await fetch(`${this.baseURL}${endpoint}`, config);

      // Apply response interceptors
      response = await this.applyResponseInterceptors(response);

      // Parse response
      const data = await response.json();

      // Handle HTTP errors
      if (!response.ok) {
        throw new ApiError(
          data.message || "An error occurred",
          response.status,
          data
        );
      }

      return {
        success: true,
        data: data as T,
        message: data.message,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new ApiError("Request timeout");
        }
        throw new ApiError(error.message);
      }

      throw new ApiError("An unexpected error occurred");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // HTTP Methods
  async get<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  async post<T>(
    endpoint: string,
    data?: unknown,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async put<T>(
    endpoint: string,
    data?: unknown,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async patch<T>(
    endpoint: string,
    data?: unknown,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  }
}

// Create API client instance
export const apiClient = new ApiClient(API_BASE_URL, API_TIMEOUT);

// Add default request interceptor for auth token
apiClient.addRequestInterceptor((config) => {
  const token = localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");
  if (token) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return config;
});

// Add response interceptor for 401 handling
apiClient.addResponseInterceptor((response) => {
  // Don't wipe token here — let AuthContext handle auth state.
  // The interceptor just returns the response so callers can handle 401 themselves.
  return response;
});

// Helper function for handling API calls with loading states
export async function withLoading<T>(
  apiCall: () => Promise<ApiResponse<T>>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await apiCall();
    return { data: response.data || null, error: null };
  } catch (error) {
    if (error instanceof ApiError) {
      return { data: null, error: error.message };
    }
    return { data: null, error: "An unexpected error occurred" };
  }
}

// Mock helper (for development without backend)
export function createMockResponse<T>(data: T, delay = 500): Promise<ApiResponse<T>> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        data,
        message: "Success (Mock)",
      });
    }, delay);
  });
}

// Mock paginated response helper
export function createMockPaginatedResponse<T>(
  items: T[],
  page = 1,
  pageSize = 10,
  delay = 500
): Promise<ApiResponse<PaginatedResponse<T>>> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const paginatedItems = items.slice(start, end);

      resolve({
        success: true,
        data: {
          items: paginatedItems,
          total: items.length,
          page,
          pageSize,
          hasMore: end < items.length,
        },
        message: "Success (Mock)",
      });
    }, delay);
  });
}
