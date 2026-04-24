// CRM Club Sinergético — Service Worker v2
const CACHE = 'crm-cs-v2';

self.addEventListener('install', e => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(url.origin !== location.origin) return;
  if(e.request.mode === 'navigate'){
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')));
  }
});

self.addEventListener('message', e => {
  if(e.data?.action === 'skipWaiting') self.skipWaiting();
});
