// Parish Connect Service Worker - Push Notifications
const CACHE_NAME = 'parish-connect-v1';

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
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
