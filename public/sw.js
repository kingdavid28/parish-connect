// Parish Connect Service Worker - Push Notifications + App Shell Cache
const CACHE_NAME = 'parish-connect-v2';

// App shell assets to pre-cache for offline support
const PRECACHE_URLS = [
    '/parish-connect/',
    '/parish-connect/manifest.json',
    '/parish-connect/parish-connect-logo.png',
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
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        ).then(() => clients.claim())
    );
});

// Network-first for API calls, cache-first for static assets
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Skip non-GET and cross-origin requests
    if (e.request.method !== 'GET') return;
    if (!url.pathname.startsWith('/parish-connect')) return;

    // API calls: network-first, no cache
    if (url.pathname.includes('/api/')) return;

    // Static assets: cache-first
    e.respondWith(
        caches.match(e.request).then((cached) => {
            if (cached) return cached;
            return fetch(e.request).then((response) => {
                // Only cache successful same-origin responses
                if (response.ok && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                }
                return response;
            }).catch(() => {
                // If offline and navigating, serve the app shell
                if (e.request.mode === 'navigate') {
                    return caches.match('/parish-connect/');
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
        icon: '/parish-connect/parish-connect-logo.png',
        badge: '/parish-connect/parish-connect-logo.png',
        tag: data.tag || 'parish-connect',
        data: { url: data.url || '/parish-connect/' },
        vibrate: [200, 100, 200],
        requireInteraction: false,
    };

    e.waitUntil(
        self.registration.showNotification(data.title || 'Parish Connect', options)
    );
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const url = e.notification.data?.url || '/parish-connect/';
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('parish-connect') && 'focus' in client) {
                    return client.focus();
                }
            }
            return clients.openWindow(url);
        })
    );
});
