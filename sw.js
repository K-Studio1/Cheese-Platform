// ============================================================
// Lumina Nexus Service Worker v1.0
// Cache CDN libraries untuk offline support
// ============================================================

var CACHE_NAME = 'lumina-v3-4-8';
var CDN_CACHE = 'lumina-cdn-v1';

// Asset yang di-cache saat install
var PRECACHE_URLS = [
  '/Lumina-Platform/',
  '/Lumina-Platform/index.html',
  '/Lumina-Platform/manifest.json',
];

// CDN yang di-cache saat pertama diakses (runtime cache)
var CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'accounts.google.com',
  'apis.google.com',
];

// Install: precache app shell
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS).catch(function(err) {
        console.warn('[SW] Precache failed:', err);
      });
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate: hapus cache lama
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_NAME && key !== CDN_CACHE;
        }).map(function(key) {
          return caches.delete(key);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch: strategi cache
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip non-GET dan backend API requests
  if (event.request.method !== 'GET') return;
  if (url.hostname.includes('deno.net')) return;
  if (url.hostname.includes('serper.dev')) return;
  if (url.hostname.includes('groq.com')) return;
  if (url.hostname.includes('openrouter.ai')) return;
  if (url.hostname.includes('googleapis.com') && url.pathname.includes('/v1beta')) return;

  // CDN: Cache First
  var isCDN = CDN_HOSTS.some(function(host) {
    return url.hostname.includes(host);
  });

  if (isCDN) {
    event.respondWith(
      caches.open(CDN_CACHE).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(response) {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(function() {
            return cached || new Response('', { status: 503 });
          });
        });
      })
    );
    return;
  }

  // App shell: Network First, fallback cache
  if (url.hostname.includes('github.io')) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(function() {
        return caches.match(event.request).then(function(cached) {
          return cached || caches.match('/Lumina-Platform/');
        });
      })
    );
    return;
  }
});
