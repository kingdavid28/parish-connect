/**
 * Central per-parish / per-deployment configuration.
 *
 * Every value is driven by VITE_* env vars at build time, so deploying the
 * app for another parish needs zero code changes — just a different .env.
 *
 *   VITE_API_BASE_URL  e.g. "https://api.example.com/api" or "/parish-connect/api"
 *   VITE_APP_URL       canonical public app URL (QR codes, share links)
 *   VITE_PARISH_*      branding: name, short name, location, tagline, accent,
 *                      logo, background
 *   VITE_RECORDS_MODE  "internal" | "off"
 *   VITE_FEATURE_*     "0"/"1" feature flags
 *
 * The runtime GET {API}/config response can override branding server-side.
 */

const env = import.meta.env;

/** Path the SPA is served under — derived from Vite `base` ("" at domain root). */
export const BASE_PATH = env.BASE_URL.replace(/\/+$/, "");

/** API base URL — same-origin `<base>/api` unless VITE_API_BASE_URL is set. */
export const API = (env.VITE_API_BASE_URL || `${BASE_PATH}/api`).replace(/\/+$/, "");

/** Canonical public URL of the app (QR codes, share links, push targets). */
export const APP_URL =
  env.VITE_APP_URL ||
  `${typeof window !== "undefined" ? window.location.origin : ""}${BASE_PATH}`;

/**
 * Resolve an asset reference to a usable URL:
 *   "https://…"      → as-is (R2, CDN, external)
 *   "brands/x.png"   → <BASE_PATH>/brands/x.png (public/ asset, any base path)
 *   "/brands/x.png"  → <BASE_PATH>/brands/x.png (leading slash = base-relative)
 */
export function resolveAssetUrl(v?: string | null): string {
  if (!v) return "";
  if (/^https?:\/\//.test(v) || v.startsWith("data:")) return v;
  const rel = v.replace(/^\.?\//, "");
  return `${BASE_PATH}/${rel}`;
}

export interface ParishBranding {
  id: string;
  name: string;
  shortName: string;
  location: string;
  tagline: string;
  accentColor: string;
  logoUrl: string;
  backgroundUrl: string;
}

export interface FeatureFlags {
  records: string; // "internal" | "off"
  wallet: boolean;
  rewards: boolean;
  finance: boolean;
}

/** Build-time parish defaults — may be overridden by GET /api/config at runtime. */
export const DEFAULT_PARISH: ParishBranding = {
  id: env.VITE_PARISH_ID || "parish",
  name: env.VITE_PARISH_NAME || "Parish Connect",
  shortName: env.VITE_PARISH_SHORT_NAME || "Parish",
  location: env.VITE_PARISH_LOCATION || "",
  tagline: env.VITE_PARISH_TAGLINE || "Your parish community app",
  accentColor: env.VITE_ACCENT_COLOR || "#2563eb",
  logoUrl: resolveAssetUrl(env.VITE_LOGO_URL || "parish-connect-logo.png"),
  backgroundUrl: resolveAssetUrl(env.VITE_BACKGROUND_URL || "background-viewport.png"),
};

export const DEFAULT_FEATURES: FeatureFlags = {
  records: env.VITE_RECORDS_MODE || "internal",
  wallet: env.VITE_FEATURE_WALLET !== "0",
  rewards: env.VITE_FEATURE_REWARDS !== "0",
  finance: env.VITE_FEATURE_FINANCE !== "0",
};

/** Default: registration requires a matching sacramental record. */
export const VERIFY_PARISH_RECORDS = env.VITE_VERIFY_PARISH_RECORDS !== "0";
