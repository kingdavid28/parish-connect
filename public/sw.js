// Parish Connect Service Worker - PWA + Push Notifications + App Shell Cache
// The deploy base path is derived from the registration scope so this file
// works identically at "/" (domain root) or "/parish-connect/" (subfolder).
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const ORIGIN = new URL(self.registration.scope).origin;

const CACHE_NAME = 'parish-connect-v4';
const RUNTIME_CACHE = 'parish-connect-runtime-v4';

// App shell assets to pre-cache for offline support
const PRECACHE_URLS = [
    `${BASE}/`,
    `${BASE}/index.html`,
    `${BASE}/manifest.json`,
    `${BASE}/parish-connect-logo.png`,
    `${BASE}/background-viewport.png`,
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

    // Static assets: cache-first with network fallback
    e.respondWith(
        caches.match(e.request).then((cached) => {
            if (cached) return cached;
            return fetch(e.request).then((response) => {
                // Only cache successful same-origin responses
                if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
                    const clone = response.clone();
                    caches.open(RUNTIME_CACHE).then((cache) => cache.put(e.request, clone));
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

self.addEventListener('push', (e) => {
    if (!e.data) return;

    let data;
    try {
        data = e.data.json();
    } catch {
        data = { title: 'Parish Connect', body: e.data.text() };
    }

    const options = {
        body: data.body || '',
        icon: `${BASE}/parish-connect-logo.png`,
        badge: `${BASE}/parish-connect-logo.png`,
        tag: data.tag || 'parish-connect',
        data: { url: data.url || `${BASE}/` },
        vibrate: [200, 100, 200],
        requireInteraction: false,
    };

    e.waitUntil(
        self.registration.showNotification(data.title || 'Parish Connect', options)
    );
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
