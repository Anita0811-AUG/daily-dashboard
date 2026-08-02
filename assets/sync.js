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

  // 需要合并而非覆盖的数据（按日期/ID去重合并）
  var MERGE_KEYS = ['dashboard_todos', 'dashboard_weights', 'dashboard_parenting', 'dashboard_spending'];

  var apiBase = 'https://api.github.com/repos/' + SYNC_CONFIG.owner + '/' + SYNC_CONFIG.repo + '/contents/' + SYNC_CONFIG.path;
  var uploadTimer = null;
  var isSyncing = false;

  // === 工具函数 ===
  function getLocal(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch(e) { return null; }
  }

  function setLocalRaw(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
  }

  function getToken() {
    var t = localStorage.getItem(TOKEN_KEY);
    return t && t.length > 10 ? t : null;
  }

  function touchMeta(key) {
    var meta = getLocal(SYNC_META_KEY) || {};
    meta[key] = Date.now();
    setLocalRaw(SYNC_META_KEY, meta);
  }

  // 拦截 localStorage.setItem
  var origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(key, value) {
    origSetItem(key, value);
    if (SYNC_KEYS.indexOf(key) !== -1) {
      touchMeta(key);
      scheduleUpload();
    }
  };

  // === 数据合并函数 ===
  // 对象类型数据：按 key 合并（云端优先，本地补充）
  function mergeObject(localVal, cloudVal) {
    if (!localVal) return cloudVal;
    if (!cloudVal) return localVal;
    var result = {};
    var allKeys = Object.keys(localVal).concat(Object.keys(cloudVal));
    var seen = {};
    allKeys.forEach(function(k) {
      if (seen[k]) return;
      seen[k] = true;
      // 云端有就用云端，否则用本地
      if (cloudVal[k] !== undefined) {
        result[k] = cloudVal[k];
      } else {
        result[k] = localVal[k];
      }
    });
    return result;
  }

  // 数组类型数据：合并去重（按日期或内容）
  function mergeArray(localVal, cloudVal) {
    if (!localVal || localVal.length === 0) return cloudVal || [];
    if (!cloudVal || cloudVal.length === 0) return localVal || [];

    var result = [];
    var seen = {};

    function getItemKey(item) {
      if (!item) return JSON.stringify(item);
      // 按日期+内容生成唯一标识
      if (item.date && item.weight) return 'w_' + item.date + '_' + item.weight;
      if (item.date && item.amount) return 's_' + item.date + '_' + item.amount + '_' + (item.category || '');
      if (item.id) return 'id_' + item.id;
      if (item.date && item.text) return 't_' + item.date + '_' + item.text;
      if (item.code) return 'c_' + item.code;
      return JSON.stringify(item);
    }

    // 先加云端数据
    cloudVal.forEach(function(item) {
      var k = getItemKey(item);
      if (!seen[k]) { seen[k] = true; result.push(item); }
    });
    // 再加本地数据（跳过已存在的）
    localVal.forEach(function(item) {
      var k = getItemKey(item);
      if (!seen[k]) { seen[k] = true; result.push(item); }
    });
    return result;
  }

  // === 上传（本地 → 云端）===
  function scheduleUpload() {
    if (!getToken()) return;
    if (uploadTimer) clearTimeout(uploadTimer);
    uploadTimer = setTimeout(doUpload, 3000);
  }

  function doUpload() {
    if (!getToken() || isSyncing) return;
    isSyncing = true;
    updateSyncUI('uploading');

    var token = getToken();
    var now = Date.now();
    var localMeta = getLocal(SYNC_META_KEY) || {};
    var payload = { _meta: {}, _time: now };

    SYNC_KEYS.forEach(function(key) {
      var val = getLocal(key);
      if (val !== null && val !== undefined) {
        payload[key] = val;
        payload._meta[key] = localMeta[key] || now;
      }
    });

    var content = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    var headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json' };

    fetch(apiBase, { headers: headers })
      .then(function(resp) {
        if (resp.status === 404) return { sha: null };
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function(data) {
        var body = { message: 'Sync ' + new Date().toISOString(), content: content };
        if (data && data.sha) body.sha = data.sha;
        return fetch(apiBase, { method: 'PUT', headers: headers, body: JSON.stringify(body) });
      })
      .then(function(resp) {
        if (!resp.ok) throw new Error('Upload failed: HTTP ' + resp.status);
        return resp.json();
      })
      .then(function() {
        SYNC_KEYS.forEach(function(key) {
          if (payload[key] !== undefined) localMeta[key] = payload._meta[key];
        });
        setLocalRaw(SYNC_META_KEY, localMeta);
        setLocalRaw(SYNC_STATUS_KEY, { status: 'ok', time: now, dir: 'up' });
        updateSyncUI('ok');
      })
      .catch(function(err) {
        setLocalRaw(SYNC_STATUS_KEY, { status: 'error', time: now, msg: err.message });
        updateSyncUI('error', err.message);
      })
      .finally(function() { isSyncing = false; });
  }

  // === 下载（云端 → 本地，合并模式）===
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
        var cloudTime = cloud._time || 0;
        var localMeta = getLocal(SYNC_META_KEY) || {};
        var changed = false;

        SYNC_KEYS.forEach(function(key) {
          if (cloud[key] === undefined) return;

          var cTime = cloudMeta[key] || cloudTime || 0;
          var lTime = localMeta[key] || 0;
          var localVal = getLocal(key);
          var cloudVal = cloud[key];

          if (localVal === null) {
            // 本地没有，直接用云端
            setLocalRaw(key, cloudVal);
            localMeta[key] = cTime;
            changed = true;
          } else {
            // 本地有，需要合并
            var merged;
            if (MERGE_KEYS.indexOf(key) !== -1) {
              // 合并模式
              if (Array.isArray(localVal) && Array.isArray(cloudVal)) {
                merged = mergeArray(localVal, cloudVal);
              } else if (typeof localVal === 'object' && typeof cloudVal === 'object') {
                merged = mergeObject(localVal, cloudVal);
              } else {
                // 标量类型：云端较新就覆盖
                merged = (cTime > lTime) ? cloudVal : localVal;
              }
              // 如果合并后数据变了，更新
              if (JSON.stringify(merged) !== JSON.stringify(localVal)) {
                setLocalRaw(key, merged);
                localMeta[key] = Math.max(cTime, lTime);
                changed = true;
              }
            } else {
              // 非合并类型：云端较新就覆盖
              if (cTime > lTime && JSON.stringify(cloudVal) !== JSON.stringify(localVal)) {
                setLocalRaw(key, cloudVal);
                localMeta[key] = cTime;
                changed = true;
              }
            }
          }
        });

        if (changed) {
          setLocalRaw(SYNC_META_KEY, localMeta);
          setLocalRaw(SYNC_STATUS_KEY, { status: 'ok', time: Date.now(), dir: 'down' });
          updateSyncUI('ok');
          setTimeout(function() { location.reload(); }, 800);
        } else {
          updateSyncUI('ok');
        }
      })
      .catch(function(err) {
        setLocalRaw(SYNC_STATUS_KEY, { status: 'error', time: Date.now(), msg: err.message });
        updateSyncUI('error', err.message);
      })
      .finally(function() { isSyncing = false; });
  }

  // === 手动同步 ===
  function doSync() {
    var token = getToken();
    if (!token) { showTokenDialog(); return; }
    doDownload();
    setTimeout(function() { doUpload(); }, 3000);
  }

  // === 强制上传所有本地数据 ===
  function forceUpload() {
    if (!getToken()) { showTokenDialog(); return; }
    if (isSyncing) return;
    isSyncing = true;
    updateSyncUI('uploading');

    var token = getToken();
    var now = Date.now();
    var payload = { _meta: {}, _time: now, _force: true };

    SYNC_KEYS.forEach(function(key) {
      var val = getLocal(key);
      if (val !== null && val !== undefined) {
        payload[key] = val;
        payload._meta[key] = now; // 强制用当前时间
      }
    });

    var content = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    var headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json' };

    fetch(apiBase, { headers: headers })
      .then(function(resp) {
        if (resp.status === 404) return { sha: null };
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function(data) {
        var body = { message: 'Force sync ' + new Date().toISOString(), content: content };
        if (data && data.sha) body.sha = data.sha;
        return fetch(apiBase, { method: 'PUT', headers: headers, body: JSON.stringify(body) });
      })
      .then(function(resp) {
        if (!resp.ok) throw new Error('Upload failed: HTTP ' + resp.status);
        return resp.json();
      })
      .then(function() {
        var localMeta = getLocal(SYNC_META_KEY) || {};
        SYNC_KEYS.forEach(function(key) {
          if (payload[key] !== undefined) localMeta[key] = now;
        });
        setLocalRaw(SYNC_META_KEY, localMeta);
        updateSyncUI('ok');
        alert('强制上传完成！请在另一台设备刷新页面');
      })
      .catch(function(err) {
        updateSyncUI('error', err.message);
        alert('上传失败: ' + err.message);
      })
      .finally(function() { isSyncing = false; });
  }

  // === 强制下载（覆盖本地）===
  function forceDownload() {
    var token = getToken();
    if (!token) { showTokenDialog(); return; }
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
        var cloudTime = cloud._time || 0;

        SYNC_KEYS.forEach(function(key) {
          if (cloud[key] !== undefined) {
            setLocalRaw(key, cloud[key]);
          }
        });
        setLocalRaw(SYNC_META_KEY, cloudMeta);
        updateSyncUI('ok');
        alert('强制下载完成！页面将刷新');
        setTimeout(function() { location.reload(); }, 500);
      })
      .catch(function(err) {
        updateSyncUI('error', err.message);
        alert('下载失败: ' + err.message);
      })
      .finally(function() { isSyncing = false; });
  }

  // === 同步详情面板 ===
  function showSyncPanel() {
    var localData = {};
    SYNC_KEYS.forEach(function(key) {
      var val = getLocal(key);
      if (val !== null) {
        var str = JSON.stringify(val);
        localData[key] = val ? (str.length > 50 ? str.substring(0, 50) + '...' : str) : 'empty';
      } else {
        localData[key] = 'NULL';
      }
    });

    var modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    var dataRows = '';
    Object.keys(localData).forEach(function(key) {
      dataRows += '<div style="display:flex;justify-content:space-between;font-size:0.8rem;padding:0.2rem 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">' + key.replace('dashboard_','') + '</span><span style="color:#1e293b;font-family:monospace;">' + localData[key] + '</span></div>';
    });

    modal.innerHTML =
      '<div style="background:white;border-radius:16px;padding:1.5rem;max-width:450px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.2);">' +
        '<h3 style="margin:0 0 1rem;font-size:1.1rem;color:#1e293b;">同步管理</h3>' +
        '<div style="margin-bottom:1rem;">' + dataRows + '</div>' +
        '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">' +
          '<button id="sync-do-sync" style="flex:1;padding:0.6rem;border:none;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;cursor:pointer;font-size:0.85rem;font-weight:600;">双向同步</button>' +
          '<button id="sync-force-up" style="flex:1;padding:0.6rem;border:none;border-radius:10px;background:#10b981;color:white;cursor:pointer;font-size:0.85rem;font-weight:600;">强制上传</button>' +
          '<button id="sync-force-down" style="flex:1;padding:0.6rem;border:none;border-radius:10px;background:#f59e0b;color:white;cursor:pointer;font-size:0.85rem;font-weight:600;">强制下载</button>' +
        '</div>' +
        '<div style="display:flex;gap:0.5rem;">' +
          '<button id="sync-set-token" style="flex:1;padding:0.5rem;border:1px solid #e2e8f0;border-radius:10px;background:white;color:#64748b;cursor:pointer;font-size:0.8rem;">设置Token</button>' +
          '<button id="sync-close" style="flex:1;padding:0.5rem;border:1px solid #e2e8f0;border-radius:10px;background:white;color:#64748b;cursor:pointer;font-size:0.8rem;">关闭</button>' +
        '</div>' +
        '<p style="font-size:0.75rem;color:#94a3b8;margin-top:0.8rem;">强制上传: 用本地数据覆盖云端<br>强制下载: 用云端数据覆盖本地<br>双向同步: 先下载合并再上传</p>' +
      '</div>';
    document.body.appendChild(modal);

    modal.querySelector('#sync-do-sync').onclick = function() { modal.remove(); doSync(); };
    modal.querySelector('#sync-force-up').onclick = function() { modal.remove(); forceUpload(); };
    modal.querySelector('#sync-force-down').onclick = function() { modal.remove(); forceDownload(); };
    modal.querySelector('#sync-set-token').onclick = function() { modal.remove(); showTokenDialog(); };
    modal.querySelector('#sync-close').onclick = function() { modal.remove(); };
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
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
        origSetItem.call(localStorage, TOKEN_KEY, val);
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
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    var header = document.querySelector('header');
    if (header) {
      header.style.position = 'relative';
      var btn = document.createElement('div');
      btn.id = 'sync-indicator';
      btn.style.cssText = 'position:absolute;top:1rem;right:0.5rem;display:flex;align-items:center;gap:0.3rem;cursor:pointer;padding:0.4rem 0.7rem;border-radius:10px;background:rgba(99,102,241,0.06);color:#64748b;font-weight:600;transition:background 0.2s;user-select:none;';
      btn.title = '点击同步数据';
      btn.innerHTML = '<span style="font-size:0.95rem;">☁️</span><span style="font-size:0.75rem;">同步</span>';
      btn.onclick = function() {
        if (getToken()) { showSyncPanel(); } else { showTokenDialog(); }
      };
      header.appendChild(btn);
    }

    if (!getToken()) {
      updateSyncUI('no-token');
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
      setTimeout(function() { doDownload(); }, 1500);
    }

    // 每 2 分钟自动下载
    setInterval(function() {
      if (getToken() && !isSyncing) { doDownload(); }
    }, 2 * 60 * 1000);

    // 页面重新可见时自动同步
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden && getToken() && !isSyncing) {
        doDownload();
      }
    });
  }

  window.DashboardSync = {
    sync: doSync,
    upload: doUpload,
    download: doDownload,
    showTokenDialog: showTokenDialog,
    hasToken: function() { return !!getToken(); }
  };

  init();
})();
