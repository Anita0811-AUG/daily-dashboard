// service-worker.js - 自毁版本（立即注销并清除缓存）
// 此文件仅用于清除旧的 Service Worker，不再提供任何缓存功能

self.addEventListener('install', function(e) {
  // 立即跳过等待，尽快激活
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      // 删除所有缓存
      return Promise.all(names.map(function(name) {
        return caches.delete(name);
      }));
    }).then(function() {
      // 注销自己
      return self.registration.unregister();
    }).then(function() {
      // 通知所有客户端刷新
      return self.clients.matchAll();
    }).then(function(clients) {
      clients.forEach(function(client) {
        client.navigate(client.url);
      });
    })
  );
});

// 不拦截任何 fetch 请求，让浏览器正常处理
self.addEventListener('fetch', function(e) {
  // 完全放行，不调用 respondWith
});
