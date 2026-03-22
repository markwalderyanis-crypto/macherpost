// MacherPost Service Worker — Push Notifications
self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'MacherPost';
  const options = {
    body: data.body || 'Neue Berichte verfügbar',
    icon: '/img/icon-192.png',
    badge: '/img/icon-192.png',
    data: { url: data.url || '/' },
    tag: 'macherpost-update',
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(clients.openWindow(url));
});
