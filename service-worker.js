// service-worker.js - PWA 离线缓存
var CACHE_NAME = 'dashboard-v20260802j';
var CACHE_URLS = [
  './daily-dashboard.html',
  './manifest.json',
  './assets/app.js?v=20260802j',
  './assets/charts.js?v=20260802j',
  './assets/ics-parser.js?v=20260802j',
  './assets/sync.js?v=20260802j',
  './_shared/js/echarts.min.js'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CACHE_URLS).catch(function() {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.map(function(name) {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // 只缓存 GET 请求
  if (e.request.method !== 'GET') return;

  // API 请求不走缓存
  var url = new URL(e.request.url);
  if (url.hostname === 'api.github.com' || url.hostname.includes('icloud.com')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var fetchPromise = fetch(e.request).then(function(resp) {
        // 成功则更新缓存
        if (resp && resp.status === 200 && resp.type === 'basic') {
          var respClone = resp.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, respClone);
          });
        }
        return resp;
      }).catch(function() {
        return cached;
      });
      return cached || fetchPromise;
    })
  );
});
