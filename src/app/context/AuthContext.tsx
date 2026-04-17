import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "admin" | "parishioner";
  parishId: string;
  avatar?: string;
  memberSince?: string;
  lastLogin?: string;
}

export enum Permission {
  VIEW_ALL_USERS = "view_all_users",
  CREATE_ADMIN = "create_admin",
  DELETE_ADMIN = "delete_admin",
  DELETE_USER = "delete_user",
  EDIT_USER = "edit_user",
  VIEW_RECORDS = "view_records",
  CREATE_RECORD = "create_record",
  EDIT_RECORD = "edit_record",
  DELETE_RECORD = "delete_record",
  EXPORT_RECORDS = "export_records",
  DELETE_ANY_POST = "delete_any_post",
  MODERATE_COMMENTS = "moderate_comments",
  MANAGE_PARISH_SETTINGS = "manage_parish_settings",
  VIEW_AUDIT_LOG = "view_audit_log",
}

const ROLE_PERMISSIONS: Record<User["role"], Permission[]> = {
  superadmin: Object.values(Permission),
  admin: [
    Permission.VIEW_ALL_USERS,
    Permission.EDIT_USER,
    Permission.DELETE_USER,
    Permission.VIEW_RECORDS,
    Permission.CREATE_RECORD,
    Permission.EDIT_RECORD,
    Permission.DELETE_RECORD,
    Permission.EXPORT_RECORDS,
    Permission.DELETE_ANY_POST,
    Permission.MODERATE_COMMENTS,
    Permission.MANAGE_PARISH_SETTINGS,
  ],
  parishioner: [Permission.VIEW_RECORDS],
};

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isLoading: boolean;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "parish_token";
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

function storeToken(token: string, rememberMe: boolean): void {
  if (rememberMe) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
}

function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [isLoading, setIsLoading] = useState(true);

  const clearAuth = useCallback(() => {
    setUser(null);
    setToken(null);
    clearStoredToken();
  }, []);

  // On mount, verify stored token with the backend
  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Token invalid");
        return res.json();
      })
      .then((json) => {
        if (json.success) setUser(json.data);
        else clearAuth();
      })
      .catch(() => clearAuth())
      .finally(() => setIsLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Global 401 interceptor — when any API call returns 401 mid-session,
  // the JWT has expired. Clear auth so ProtectedRoute redirects to /login.
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await originalFetch(...args);
      if (response.status === 401) {
        const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
        // Don't clear on login/register — those legitimately return 401 for bad creds
        if (!url.includes("/auth/login") && !url.includes("/auth/register")) {
          clearAuth();
        }
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [clearAuth]);

  const login = useCallback(async (email: string, password: string, rememberMe = false) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || "Invalid credentials");
    }

    const { token: newToken, user: newUser } = json.data;
    storeToken(newToken, rememberMe);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  const hasPermission = useCallback(
    (permission: Permission): boolean => {
      if (!user) return false;
      return (ROLE_PERMISSIONS[user.role] || []).includes(permission);
    },
    [user]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isAuthenticated: !!user,
        isAdmin: user?.role === "admin" || user?.role === "superadmin",
        isSuperAdmin: user?.role === "superadmin",
        isLoading,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
