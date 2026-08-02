// service-worker.js - PWA 离线缓存（网络优先模式）
var CACHE_NAME = 'dashboard-v20260802k';
var CACHE_URLS = [
  './daily-dashboard.html',
  './manifest.json',
  './assets/app.js?v=20260802k',
  './assets/charts.js?v=20260802k',
  './assets/ics-parser.js?v=20260802k',
  './assets/sync.js?v=20260802k',
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
  if (e.request.method !== 'GET') return;

  var url = new URL(e.request.url);

  // API 请求和 CORS 代理请求不走缓存
  if (url.hostname === 'api.github.com' || url.hostname.includes('icloud.com')) {
    return;
  }

  // 网络优先：先尝试从网络获取，失败时回退到缓存
  e.respondWith(
    fetch(e.request)
      .then(function(resp) {
        // 成功则更新缓存
        if (resp && resp.status === 200 && (resp.type === 'basic' || resp.type === 'cors')) {
          var respClone = resp.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, respClone);
          });
        }
        return resp;
      })
      .catch(function() {
        // 网络失败，回退到缓存
        return caches.match(e.request).then(function(cached) {
          if (cached) return cached;
          // 如果是导航请求且缓存没有，返回主页面缓存
          if (e.request.mode === 'navigate') {
            return caches.match('./daily-dashboard.html');
          }
          return new Response('离线模式，数据不可用', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
