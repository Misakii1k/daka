const CACHE = 'worklog-1.0.9';
const ASSETS = [
  './',
  './index.html',
  './theme-init.js',
  './style.css',
  './app.js',
  './core.js',
  './nn_weights.js',
  './nn_engine.js',
  './handwriting.js',
  './exporter.js',
  './fx_celebration.js',
  './holidays.js',
  './webdav.js',
  './manifest.webmanifest',
  './version.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(url => c.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cachePut(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return;
  const copy = response.clone();
  caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
}

// 静态资源缓存优先；导航与版本文件网络优先；API 不经过 Service Worker。
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') === 0) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => { cachePut(req, res); return res; })
        .catch(() => caches.match('./index.html').then(cached => cached || new Response('离线', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        })))
    );
    return;
  }

  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/sw.js')) {
    e.respondWith(fetch(req).catch(() => caches.match(req, { ignoreSearch: true }).then(cached => cached || new Response('', {
      status: 504,
      statusText: 'Offline'
    }))));
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        cachePut(req, res);
        return res;
      });
    })
  );
});
