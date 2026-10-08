import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  API,
  APP_URL,
  BASE_PATH,
  DEFAULT_FEATURES,
  DEFAULT_PARISH,
  VERIFY_PARISH_RECORDS,
  resolveAssetUrl,
} from "../config";
import type { FeatureFlags, ParishBranding } from "../config";

export interface ParishConfig {
  parish: ParishBranding;
  features: FeatureFlags;
  appUrl: string;
  basePath: string;
  verifyParishRecords: boolean;
  /** true once the server config has been fetched (or fetch failed) */
  loaded: boolean;
}

const DEFAULT_CONFIG: ParishConfig = {
  parish: DEFAULT_PARISH,
  features: DEFAULT_FEATURES,
  appUrl: APP_URL,
  basePath: BASE_PATH,
  verifyParishRecords: VERIFY_PARISH_RECORDS,
  loaded: false,
};

const ParishConfigContext = createContext<ParishConfig>(DEFAULT_CONFIG);

/** Apply branding side effects: accent color, page background, theme-color, title. */
function applyBranding(parish: ParishBranding) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (parish.accentColor) {
    root.style.setProperty("--parish-accent", parish.accentColor);
  }
  document.body.style.backgroundImage = parish.backgroundUrl
    ? `url("${parish.backgroundUrl}")`
    : "none";
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta && parish.accentColor) themeMeta.setAttribute("content", parish.accentColor);
  if (parish.name && parish.name !== "Parish Connect") {
    document.title = `${parish.name} — Parish Connect`;
  }
}

export function ParishConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ParishConfig>(DEFAULT_CONFIG);

  // Fetch runtime config from the API — lets branding change without a rebuild.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body?.success) return;
        const d = body.data || {};
        const parish = { ...(d.parish || {}) };
        // Backend may return relative paths — resolve against the app base.
        if (parish.logoUrl) parish.logoUrl = resolveAssetUrl(parish.logoUrl);
        if (parish.backgroundUrl) parish.backgroundUrl = resolveAssetUrl(parish.backgroundUrl);
        setConfig((prev) => ({
          parish: { ...prev.parish, ...parish },
          features: { ...prev.features, ...(d.features || {}) },
          appUrl: d.appUrl || prev.appUrl,
          basePath: d.basePath ?? prev.basePath,
          verifyParishRecords: d.verifyParishRecords ?? prev.verifyParishRecords,
          loaded: true,
        }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setConfig((prev) => (prev.loaded ? prev : { ...prev, loaded: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyBranding(config.parish);
  }, [config.parish]);

  const value = useMemo(() => config, [config]);

  return <ParishConfigContext.Provider value={value}>{children}</ParishConfigContext.Provider>;
}

export function useParishConfig() {
  return useContext(ParishConfigContext);
}
