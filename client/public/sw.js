/* ============================================================
   Leccy — Service Worker
   Network-first for live assets/APIs, offline fallback from cache
   ============================================================ */

const CACHE_NAME = 'leccy-1.6.2';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
];

function freshRequest(request) {
  return new Request(request, { cache: 'reload' });
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        STATIC_ASSETS.map(url =>
          fetch(freshRequest(url))
            .then(response => {
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              return cache.put(url, response);
            })
            .catch(err => console.warn('SW: Failed to cache', url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline — no network connection.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // For SPA navigation requests, load the newest shell first and keep cache as an offline fallback.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(freshRequest(event.request)).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/', clone));
        }
        return response;
      }).catch(() => caches.match('/').then(cached => cached || fetch('/')))
    );
    return;
  }

  // Network-first for static assets so a version bump refreshes local files promptly.
  event.respondWith(
    fetch(freshRequest(event.request)).then(response => {
      if (response && response.status === 200 && url.origin === self.location.origin) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request).then(cached => cached || new Response('Offline', { status: 503 })))
  );
});

self.addEventListener('push', event => {
  let data = {
    title: 'Leccy charge reminder',
    body: 'A charge is in progress. Enter the end-charge data when you next use the car.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-androidBar.png',
    url: '/quick-data-entry',
    tag: 'leccy-charge-in-progress',
  };

  if (event.data) {
    try {
      data = { ...data, ...JSON.parse(event.data.text()) };
    } catch {
      // Keep defaults.
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      data: { url: data.url },
      tag: data.tag,
      renotify: true,
      timestamp: Date.now(),
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/quick-data-entry';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const target = new URL(targetUrl, self.location.origin);
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === target.origin && 'focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(target.href);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target.href);
    })
  );
});
