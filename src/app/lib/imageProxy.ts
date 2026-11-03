import { API } from "../config";

/**
 * Rewrite R2 public URLs to go through the API proxy so images still load
 * when the client cannot resolve/reach the R2 public hostname directly.
 * Non-R2 URLs (relative paths, other hosts) are returned unchanged.
 */
export function proxyImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.hostname.endsWith(".r2.dev")) {
      const key = u.pathname.replace(/^\/+/, "");
      if (key) return `${API}/files/${key}`;
    }
  } catch {
    // Not an absolute URL — leave as-is.
  }
  return url;
}