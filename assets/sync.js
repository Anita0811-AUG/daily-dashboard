// sync.js - GitHub 仓库数据同步（跨设备）
(function() {
  'use strict';

  var SYNC_CONFIG = {
    owner: 'Anita0811-AUG',
    repo: 'daily-dashboard',
    path: 'sync-data.json'
  };

  var TOKEN_KEY = 'dashboard_github_token';
  var SYNC_META_KEY = '_sync_meta';
  var SYNC_STATUS_KEY = '_sync_last_status';

  // 需要同步的数据 key
  var SYNC_KEYS = [
    'dashboard_todos',
    'dashboard_weights',
    'dashboard_weight_goal',
    'dashboard_calorie_profile',
    'dashboard_baby_profile',
    'dashboard_parenting',
    'dashboard_vaccinated',
    'dashboard_spending',
    'dashboard_stock_list',
    'dashboard_fund_list',
    'dashboard_deferred_cal'
  ];

  var apiBase = 'https://api.github.com/repos/' + SYNC_CONFIG.owner + '/' + SYNC_CONFIG.repo + '/contents/' + SYNC_CONFIG.path;
  var uploadTimer = null;
  var isSyncing = false;

  // === 工具函数 ===
  function getLocal(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch(e) { return null; }
  }
  function setLocal(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
  }
  function getToken() {
    var t = localStorage.getItem(TOKEN_KEY);
    return t && t.length > 10 ? t : null;
  }

  // 记录某个 key 的更新时间
  function touchMeta(key) {
    var meta = getLocal(SYNC_META_KEY) || {};
    meta[key] = Date.now();
    setLocal(SYNC_META_KEY, meta);
  }

  // 监听 saveData 调用 —— 通过拦截 localStorage.setItem
  var origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(key, value) {
    origSetItem(key, value);
    if (SYNC_KEYS.indexOf(key) !== -1) {
      touchMeta(key);
      scheduleUpload();
    }
  };

  // === 上传（本地 → 云端）===
  function scheduleUpload() {
    if (!getToken()) return;
    if (uploadTimer) clearTimeout(uploadTimer);
    uploadTimer = setTimeout(doUpload, 5000); // 防抖：5秒内多次修改只上传一次
  }

  function doUpload() {
    if (!getToken() || isSyncing) return;
    isSyncing = true;
    updateSyncUI('uploading');

    var token = getToken();
    var payload = { _meta: getLocal(SYNC_META_KEY) || {}, _time: Date.now() };
    SYNC_KEYS.forEach(function(key) {
      var val = getLocal(key);
      if (val !== null) payload[key] = val;
    });

    var content = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    var headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json' };

    // 先获取当前文件的 SHA
    fetch(apiBase, { headers: headers })
      .then(function(resp) {
        if (resp.status === 404) return { sha: null }; // 文件不存在
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function(data) {
        var body = { message: 'Sync dashboard data ' + new Date().toISOString(), content: content };
        if (data && data.sha) body.sha = data.sha;

        return fetch(apiBase, {
          method: 'PUT',
          headers: headers,
          body: JSON.stringify(body)
        });
      })
      .then(function(resp) {
        if (!resp.ok) throw new Error('Upload failed: HTTP ' + resp.status);
        return resp.json();
      })
      .then(function() {
        setLocal(SYNC_STATUS_KEY, { status: 'ok', time: Date.now(), dir: 'up' });
        updateSyncUI('ok');
      })
      .catch(function(err) {
        setLocal(SYNC_STATUS_KEY, { status: 'error', time: Date.now(), msg: err.message });
        updateSyncUI('error', err.message);
      })
      .finally(function() { isSyncing = false; });
  }

  // === 下载（云端 → 本地）===
  function doDownload() {
    var token = getToken();
    if (!token) { updateSyncUI('no-token'); return; }
    if (isSyncing) return;
    isSyncing = true;
    updateSyncUI('downloading');

    var headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json' };

    fetch(apiBase, { headers: headers })
      .then(function(resp) {
        if (resp.status === 404) { updateSyncUI('empty'); isSyncing = false; return null; }
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function(data) {
        if (!data) return;
        var decoded = decodeURIComponent(escape(atob(data.content)));
        var cloud = JSON.parse(decoded);
        var cloudMeta = cloud._meta || {};
        var localMeta = getLocal(SYNC_META_KEY) || {};
        var changed = false;

        SYNC_KEYS.forEach(function(key) {
          if (cloud[key] === undefined) return;
          var cloudTime = cloudMeta[key] || 0;
          var localTime = localMeta[key] || 0;
          // 云端数据较新，或本地没有该数据
          if (cloudTime > localTime || getLocal(key) === null) {
            setLocal(key, cloud[key]);
            localMeta[key] = cloudTime;
            changed = true;
          }
        });

        if (changed) {
          setLocal(SYNC_META_KEY, localMeta);
          setLocal(SYNC_STATUS_KEY, { status: 'ok', time: Date.now(), dir: 'down' });
          // 重新渲染页面
          if (typeof window.onSyncComplete === 'function') {
            window.onSyncComplete();
          } else {
            setTimeout(function() { location.reload(); }, 500);
          }
        }
        updateSyncUI('ok');
      })
      .catch(function(err) {
        setLocal(SYNC_STATUS_KEY, { status: 'error', time: Date.now(), msg: err.message });
        updateSyncUI('error', err.message);
      })
      .finally(function() { isSyncing = false; });
  }

  // === 手动同步（双向）===
  function doSync() {
    var token = getToken();
    if (!token) { showTokenDialog(); return; }
    doDownload();
    setTimeout(function() { doUpload(); }, 3000);
  }

  // === Token 设置弹窗 ===
  function showTokenDialog() {
    var existing = getToken() || '';
    var modal = document.createElement('div');
    modal.id = 'sync-token-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML =
      '<div style="background:white;border-radius:16px;padding:2rem;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);">' +
        '<h3 style="margin:0 0 1rem;font-size:1.2rem;color:#1e293b;">设置同步 Token</h3>' +
        '<p style="font-size:0.85rem;color:#64748b;margin-bottom:1rem;">输入你的 GitHub Personal Access Token（需 repo 权限）用于跨设备数据同步。<br>Token 只存储在当前设备本地，不会上传。</p>' +
        '<input type="password" id="sync-token-input" placeholder="ghp_xxxxxxxx..." value="' + existing + '" style="width:100%;padding:0.6rem 0.8rem;border:1px solid rgba(99,102,241,0.2);border-radius:10px;font-size:0.9rem;margin-bottom:1rem;box-sizing:border-box;">' +
        '<div style="display:flex;gap:0.5rem;justify-content:flex-end;">' +
          '<button id="sync-token-cancel" style="padding:0.5rem 1rem;border:none;border-radius:10px;background:#f1f5f9;color:#64748b;cursor:pointer;font-size:0.9rem;">取消</button>' +
          '<button id="sync-token-save" style="padding:0.5rem 1rem;border:none;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;cursor:pointer;font-size:0.9rem;font-weight:600;">保存</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    modal.querySelector('#sync-token-save').onclick = function() {
      var val = modal.querySelector('#sync-token-input').value.trim();
      if (val) {
        localStorage.setItem(TOKEN_KEY, val);
        modal.remove();
        doDownload();
      }
    };
    modal.querySelector('#sync-token-cancel').onclick = function() { modal.remove(); };
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  }

  // === UI 状态更新 ===
  function updateSyncUI(state, msg) {
    var indicator = document.getElementById('sync-indicator');
    if (!indicator) return;
    var icon = '', text = '', color = '#64748b';
    switch(state) {
      case 'ok': icon = '☁️'; text = '已同步'; color = '#10b981'; break;
      case 'uploading': icon = '⬆️'; text = '上传中...'; color = '#6366f1'; break;
      case 'downloading': icon = '⬇️'; text = '同步中...'; color = '#6366f1'; break;
      case 'error': icon = '⚠️'; text = '同步失败'; color = '#ef4444'; break;
      case 'no-token': icon = '🔗'; text = '未连接'; color = '#f59e0b'; break;
      case 'empty': icon = '☁️'; text = '云端无数据'; color = '#64748b'; break;
      default: icon = '☁️'; text = '同步'; color = '#64748b';
    }
    indicator.innerHTML = '<span style="font-size:0.95rem;">' + icon + '</span><span style="font-size:0.75rem;">' + text + '</span>';
    indicator.style.color = color;
    if (msg) indicator.title = msg;
  }

  // === 初始化 ===
  function init() {
    // 等待 DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    // 如果页面已有 header，在 header 旁边添加同步按钮
    var header = document.querySelector('header');
    if (header) {
      header.style.position = 'relative';
      var btn = document.createElement('div');
      btn.id = 'sync-indicator';
      btn.style.cssText = 'position:absolute;top:1rem;right:0.5rem;display:flex;align-items:center;gap:0.3rem;cursor:pointer;padding:0.4rem 0.7rem;border-radius:10px;background:rgba(99,102,241,0.06);color:#64748b;font-weight:600;transition:background 0.2s;user-select:none;';
      btn.title = '点击同步数据';
      btn.innerHTML = '<span style="font-size:0.95rem;">☁️</span><span style="font-size:0.75rem;">同步</span>';
      btn.onclick = function() {
        if (getToken()) { doSync(); } else { showTokenDialog(); }
      };
      header.appendChild(btn);
    }

    // 初始状态
    if (!getToken()) {
      updateSyncUI('no-token');
      // 首次使用，提示设置 token
      setTimeout(function() {
        if (!getToken()) {
          var tip = document.createElement('div');
          tip.style.cssText = 'position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);background:#f59e0b;color:white;padding:0.6rem 1.2rem;border-radius:10px;font-size:0.85rem;box-shadow:0 4px 16px rgba(0,0,0,0.15);z-index:9998;cursor:pointer;';
          tip.innerHTML = '🔗 点击右上角"同步"设置 GitHub Token，开启跨设备数据同步';
          tip.onclick = function() { tip.remove(); showTokenDialog(); };
          document.body.appendChild(tip);
          setTimeout(function() { if (tip.parentNode) tip.remove(); }, 8000);
        }
      }, 2000);
    } else {
      // 有 token，启动时先下载
      setTimeout(function() { doDownload(); }, 1500);
    }

    // 定时自动同步（每 5 分钟）
    setInterval(function() {
      if (getToken()) { doDownload(); }
    }, 5 * 60 * 1000);
  }

  // 暴露给外部
  window.DashboardSync = {
    sync: doSync,
    upload: doUpload,
    download: doDownload,
    showTokenDialog: showTokenDialog,
    hasToken: function() { return !!getToken(); }
  };

  init();
})();
