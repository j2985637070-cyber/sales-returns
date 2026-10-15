// Minimal service worker: always fetch the newest app from the network; fall back to the last
// saved copy only when offline. Data itself is never cached here.
// The warehouse app under wms/ has its own service worker, so its pages are left alone.
// It also shows the push notifications, and a tap opens the app on the message.
const CACHE = 'sales-returns-shell-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/wms/')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});

// the app's own open windows (not the warehouse app)
function appWindows() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(list => list.filter(c => c.url.startsWith(self.registration.scope) && !c.url.includes('/wms/')));
}

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'מכירות מול החזרות', {
      body: d.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      dir: 'rtl',
      lang: 'he',
      tag: d.tag || undefined,
      data: { url: d.url || './' }
    }),
    // an open app updates its bell right away
    appWindows().then(list => list.forEach(c => c.postMessage({ type: 'pushed' })))
  ]));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(appWindows().then(list => {
    if (list.length) {
      list[0].postMessage({ type: 'open-message', url });
      return list[0].focus();
    }
    return self.clients.openWindow(url);
  }));
});
