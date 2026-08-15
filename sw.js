const CACHE_NAME = 'family-vitals-v1';
const OFFLINE_URL = '/offline.html';

const filesToCache = [
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/supabaseClient.js',
  '/manifest.json',
  '/offline.html'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(filesToCache))
  );
});

self.addEventListener('activate', event => {
  const currentCaches = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return cacheNames.filter(cacheName => !currentCaches.includes(cacheName));
    })
    .then(cachesToDelete => {
      return Promise.all(
        cachesToDelete.map(cacheName => caches.delete(cacheName))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) return response;
      
      return fetch(event.request).then(networkResponse => {
        return networkResponse;
      }).catch(() => {
        return caches.match(OFFLINE_URL);
      });
    })
  );
});