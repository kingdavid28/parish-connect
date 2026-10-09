import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// Public base path. Set VITE_BASE_PATH to deploy under a subfolder
// (e.g. "/parish-connect" → base "/parish-connect/"). Set it to "/" for a
// domain-root deployment (e.g. Cloudflare Pages). Vite does NOT load .env
// files into process.env during config eval, so read via loadEnv too.
function computeBase(mode: string): string {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const basePath = env.VITE_BASE_PATH;
  return basePath !== undefined
    ? (basePath.endsWith('/') ? basePath : `${basePath}/`)
    : (process.env.NODE_ENV === 'production' ? '/parish-connect/' : '/');
}

/**
 * parishBrandingPlugin — single source of truth for static branding.
 *
 * Generates manifest.json at build time (and serves it in dev) and rewrites
 * index.html's <title>, favicon, theme-color, etc. from VITE_* env vars.
 * All defaults match the current values, so an env-less build is unchanged.
 */
function parishBrandingPlugin(mode: string): Plugin {
  // loadEnv covers .env / .env.[mode] files; process.env covers CI/Pages env.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };

  const parishName = env.VITE_PARISH_NAME || 'Parish Connect';
  const shortName = env.VITE_PARISH_SHORT_NAME || 'Parish';
  const description = env.VITE_PARISH_TAGLINE || 'Your parish community app';
  const themeColor = env.VITE_ACCENT_COLOR || '#2563eb';
  const logoUrl = env.VITE_LOGO_URL || 'parish-connect-logo.png';
  // PWA icon stem: files <stem>-192.png / <stem>-512.png in public/.
  // Falls back to the app logo for both sizes.
  const iconStem = env.VITE_PWA_ICON;

  const toHref = (v: string) =>
    /^https?:\/\//.test(v) ? v : `./${v.replace(/^\.?\//, '')}`;

  const logoHref = toHref(logoUrl);
  const icon192 = toHref(iconStem ? `${iconStem}-192.png` : logoUrl);
  const icon512 = toHref(iconStem ? `${iconStem}-512.png` : logoUrl);
  const iconType = (u: string) => (u.endsWith('.jpg') || u.endsWith('.jpeg') ? 'image/jpeg' : 'image/png');

  const manifest = {
    name: parishName,
    short_name: shortName,
    description,
    start_url: './',
    scope: './',
    display: 'standalone',
    display_override: ['standalone', 'window-controls-overlay', 'minimal-ui'],
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: themeColor,
    lang: 'en',
    dir: 'ltr',
    categories: ['community', 'lifestyle', 'social'],
    screenshots: [],
    icons: [
      { src: icon192, sizes: '192x192', type: iconType(icon192), purpose: 'any maskable' },
      { src: icon512, sizes: '512x512', type: iconType(icon512), purpose: 'any maskable' },
    ],
    shortcuts: [
      { name: 'Feed', short_name: 'Feed', description: 'View community feed', url: './', icons: [{ src: icon192, sizes: '192x192' }] },
      { name: 'Records', short_name: 'Records', description: 'View parish records', url: './records', icons: [{ src: icon192, sizes: '192x192' }] },
    ],
  };

  return {
    name: 'parish-branding',
    transformIndexHtml(html) {
      return html
        .replace(/<title>[^<]*<\/title>/, `<title>${parishName}</title>`)
        .replace(/content="Parish Connect — Your parish community app"/, `content="${parishName} — ${description}"`)
        .replace(/content="#2563eb"/g, `content="${themeColor}"`)
        .replace(/content="Parish"(?=\s*\/>)/, `content="${shortName}"`)
        .replace(/href="\.\/parish-connect-logo\.png"/g, `href="${logoHref}"`);
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(manifest, null, 2),
      });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (url.endsWith('/manifest.json') || url === '/manifest.json') {
          res.setHeader('Content-Type', 'application/manifest+json');
          res.end(JSON.stringify(manifest, null, 2));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: computeBase(mode),
  plugins: [
    react(),
    tailwindcss(),
    parishBrandingPlugin(mode),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'src/app/components/ui/', 'dist/'],
    },
  },
}))
