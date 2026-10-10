// Parish Connect Service Worker - PWA + Push Notifications + App Shell Cache
// The deploy base path is derived from the registration scope so this file
// works identically at "/" (domain root) or "/parish-connect/" (subfolder).
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const ORIGIN = new URL(self.registration.scope).origin;

const CACHE_NAME = 'parish-connect-v5';
const RUNTIME_CACHE = 'parish-connect-runtime-v5';

// Only truly static metadata is pre-cached. index.html is deliberately NOT
// here: caching it cache-first pins users to a stale app shell — hashed JS/CSS
// references rot and old branding sticks. Navigations go network-first below
// with the runtime cache as an offline fallback.
const PRECACHE_URLS = [
    `${BASE}/manifest.json`,
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    // Remove old caches on activation
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== RUNTIME_CACHE).map((k) => caches.delete(k)))
        ).then(() => clients.claim())
    );
});

// Network-first for API calls, cache-first for static assets
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Skip non-GET requests
    if (e.request.method !== 'GET') return;

    // API calls: network-first, offline fallback JSON (covers cross-origin API hosts too)
    if (url.pathname.includes('/api/')) {
        e.respondWith(
            fetch(e.request).catch(() => {
                return new Response(JSON.stringify({
                    success: false,
                    message: 'Offline - Please check your connection'
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // Only cache same-origin requests inside our base path
    if (url.origin !== ORIGIN) return;
    if (BASE && !url.pathname.startsWith(`${BASE}/`)) return;
    if (!BASE && url.pathname === '/sw.js') { /* fallthrough, allow */ }

    // Navigations: network-first so deploys reach users immediately;
    // refresh the cached app shell for offline use as a side effect.
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request).then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    e.waitUntil(caches.open(RUNTIME_CACHE).then((cache) => cache.put(`${BASE}/index.html`, clone)));
                }
                return response;
            }).catch(() => caches.match(`${BASE}/index.html`))
        );
        return;
    }

    // Static assets: cache-first with network fallback.
    // Safe for hashed build output (immutable filenames); images cached
    // at runtime may lag a deploy by one visit — acceptable trade-off.
    e.respondWith(
        caches.match(e.request).then((cached) => {
            if (cached) return cached;
            return fetch(e.request).then((response) => {
                // Only cache successful same-origin responses
                if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
                    const clone = response.clone();
                    e.waitUntil(caches.open(RUNTIME_CACHE).then((cache) => cache.put(e.request, clone)));
                }
                return response;
            }).catch(() => {
                // If offline and navigating, serve the app shell
                if (e.request.mode === 'navigate') {
                    return caches.match(`${BASE}/index.html`);
                }
            });
        })
    );
});

// Push/badge icons come from the per-parish manifest generated at build
// time — falls back to the generic logo if the manifest can't be read.
async function parishIcon() {
    try {
        const res = await fetch(`${BASE}/manifest.json`);
        const manifest = await res.json();
        const src = manifest.icons?.[0]?.src;
        return src ? new URL(src, ORIGIN + BASE + '/').href : `${BASE}/parish-connect-logo.png`;
    } catch {
        return `${BASE}/parish-connect-logo.png`;
    }
}

self.addEventListener('push', (e) => {
    if (!e.data) return;

    let data;
    try {
        data = e.data.json();
    } catch {
        data = { title: 'Parish Connect', body: e.data.text() };
    }

    e.waitUntil((async () => {
        const icon = await parishIcon();
        const options = {
            body: data.body || '',
            icon,
            badge: icon,
            tag: data.tag || 'parish-connect',
            data: { url: data.url || `${BASE}/` },
            vibrate: [200, 100, 200],
            requireInteraction: false,
        };
        await self.registration.showNotification(data.title || 'Parish Connect', options);
    })());
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const url = e.notification.data?.url || `${BASE}/`;
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.startsWith(ORIGIN + BASE) && 'focus' in client) {
                    return client.focus();
                }
            }
            return clients.openWindow(url);
        })
    );
});
