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

// the server the "קיבלתי ✓" button answers to (public key; the per-message key is what allows it)
const SUPA_URL = 'https://iwatwpcemndhjysghzil.supabase.co';
const SUPA_KEY = 'sb_publishable_4boIKxcwLdps6bgEtCDMAw_IcK7Ekev';

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  // a message the admin sent by hand (or the admin's reply in it): buttons under the notification.
  // Android and computers show them; an iPhone shows none, and a tap opens the conversation.
  const canReply = !!(d.msg && d.key);
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'מכירות מול החזרות', {
      body: d.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      dir: 'rtl',
      lang: 'he',
      tag: d.tag || undefined,
      actions: canReply ? [{ action: 'ack', title: 'קיבלתי ✓' }, { action: 'reply', title: 'השב' }] : [],
      data: { url: d.url || './', msg: d.msg || null, key: d.key || null }
    }),
    // an open app updates its bell right away
    appWindows().then(list => list.forEach(c => c.postMessage({ type: 'pushed' })))
  ]));
});

function quickAck(data) {
  return fetch(SUPA_URL + '/rest/v1/rpc/svr_message_quick', {
    method: 'POST',
    headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_message: data.msg, p_key: data.key })
  }).then(res => {
    if (!res.ok) throw new Error(String(res.status));
    return appWindows().then(list => list.forEach(c => c.postMessage({ type: 'pushed' })));
  }).catch(() =>
    // no connection, or the message was deleted: say so, so nobody thinks it went out
    self.registration.showNotification('"קיבלתי" לא נשלח', {
      body: 'פתחו את ההודעה באפליקציה ונסו שוב', icon: 'icon-192.png', badge: 'icon-192.png', dir: 'rtl', lang: 'he',
      data: { url: (data && data.url) || './' }
    }));
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  if (e.action === 'ack' && data.msg && data.key) {
    e.waitUntil(quickAck(data));
    return;
  }
  let url = new URL(data.url || './', self.registration.scope);
  // "השב": the conversation opens with the reply box ready
  if (e.action === 'reply') url.searchParams.set('r', '1');
  url = url.href;
  e.waitUntil(appWindows().then(list => {
    if (list.length) {
      list[0].postMessage({ type: 'open-message', url });
      return list[0].focus();
    }
    return self.clients.openWindow(url);
  }));
});
