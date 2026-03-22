// ============================================================
// Lumina Nexus Service Worker v3.4-17
// by Kira · Updated: logo baru, cache version bump
// ============================================================

var CACHE_NAME = 'lumina-v3-4-17';
var CDN_CACHE = 'lumina-cdn-v2';

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
      return self.skipWaiting(); // Langsung aktif tanpa tunggu tab lama
    })
  );
});

// Activate: hapus SEMUA cache lama
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_NAME && key !== CDN_CACHE;
        }).map(function(key) {
          console.log('[SW] Deleting old cache:', key);
          return caches.delete(key);
        })
      );
    }).then(function() {
      return self.clients.claim(); // Ambil alih semua tab
    })
  );
});

// Fetch: strategi cache
self.addEventListener('fetch', function(event) {
  var url;
  try {
    url = new URL(event.request.url);
  } catch(e) {
    return;
  }

  // Skip non-GET
  if (event.request.method !== 'GET') return;

  // Skip backend & AI API — jangan pernah cache
  var skipHosts = [
    'deno.net', 'serper.dev', 'groq.com', 'openrouter.ai',
    'generativelanguage.googleapis.com', 'brevo.com',
    'cloudflare-ai.workers.dev'
  ];
  if (skipHosts.some(function(h) { return url.hostname.includes(h); })) return;

  // Skip Google AI API
  if (url.hostname.includes('googleapis.com') && 
      (url.pathname.includes('/v1beta') || url.pathname.includes('/v1/'))) return;

  // CDN: Cache First (font, library statis)
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

  // App shell (GitHub Pages): Network First, fallback cache
  if (url.hostname.includes('github.io') || url.hostname.includes('kira-128')) {
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

// Message handler - force refresh cache
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) {
        return caches.delete(key);
      }));
    });
  }
});
