// Lightweight sync queue. This is not full offline sync yet.
(function() {
  const FALLBACK_KEY = 'plotmap_sync_queue_v1';

  function adapter() {
    return window.PMDataAdapter || null;
  }

  function nowIso() {
    return (adapter() && adapter().nowIso()) || new Date().toISOString();
  }

  function generateId() {
    return (adapter() && adapter().generateId('sync')) || `sync-${Math.random().toString(36).slice(2, 11)}`;
  }

  function loadFallback() {
    try {
      return JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]');
    } catch (err) {
      return [];
    }
  }

  function saveFallback(queue) {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(queue || []));
  }

  function withQueue(mutator) {
    if (adapter()) {
      const data = adapter().getData();
      if (!Array.isArray(data.syncQueue)) data.syncQueue = [];
      const result = mutator(data.syncQueue, data);
      data.syncMeta = Object.assign({ lastSyncedAt: null, offlineGraceHours: 24 }, data.syncMeta || {}, {
        pendingCount: data.syncQueue.filter(item => item.status === 'pending').length,
        failedCount: data.syncQueue.filter(item => item.status === 'failed').length
      });
      adapter().saveData(data);
      return result;
    }

    const queue = loadFallback();
    const result = mutator(queue, null);
    saveFallback(queue);
    return result;
  }

  function enqueueSyncAction(action) {
    return withQueue(queue => {
      const item = Object.assign({
        id: generateId(),
        dealerId: null,
        entityType: '',
        entityId: '',
        actionType: '',
        payload: {},
        createdAt: nowIso(),
        status: 'pending',
        retryCount: 0,
        lastError: ''
      }, action || {});
      queue.push(item);
      return item;
    });
  }

  function getPendingSyncActions() {
    return withQueue(queue => queue.filter(item => item.status === 'pending'));
  }

  function markSyncActionSynced(id) {
    return withQueue((queue, data) => {
      const item = queue.find(entry => entry.id === id);
      if (!item) return null;
      item.status = 'synced';
      item.syncedAt = nowIso();
      if (data) data.syncMeta = Object.assign({}, data.syncMeta || {}, { lastSyncedAt: item.syncedAt });
      return item;
    });
  }

  function markSyncActionFailed(id, error) {
    return withQueue(queue => {
      const item = queue.find(entry => entry.id === id);
      if (!item) return null;
      item.status = 'failed';
      item.retryCount = Number(item.retryCount || 0) + 1;
      item.lastError = String(error || 'Sync failed').slice(0, 300);
      return item;
    });
  }

  function getSyncStatus() {
    return withQueue((queue, data) => {
      const meta = data && data.syncMeta ? data.syncMeta : {};
      return {
        lastSyncedAt: meta.lastSyncedAt || null,
        pendingCount: queue.filter(item => item.status === 'pending').length,
        failedCount: queue.filter(item => item.status === 'failed').length,
        offlineGraceHours: Number(meta.offlineGraceHours || 24)
      };
    });
  }

  function renderStatusText(status) {
    if (status.failedCount > 0) return `Sync failed: ${status.failedCount}`;
    if (status.pendingCount > 0) return `Pending sync: ${status.pendingCount}`;
    return 'Synced';
  }

  function mountSyncStatus(target) {
    const mount = () => {
      if (!/^\/admin\//i.test(location.pathname) || /\/admin\/index\.html$/i.test(location.pathname) || /\/admin\/access-expired\.html$/i.test(location.pathname)) return;
      const bar = target || document.querySelector('.pm-topbar');
      if (!bar || document.getElementById('pm-sync-mini')) return;
      const badge = document.createElement('span');
      badge.id = 'pm-sync-mini';
      badge.className = 'role-badge';
      badge.style.background = '#f7f5ef';
      badge.style.color = '#5f6b7a';
      badge.style.borderColor = 'var(--pm-border)';
      const refresh = () => {
        const status = getSyncStatus();
        badge.textContent = renderStatusText(status);
        badge.title = status.lastSyncedAt ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}` : 'Local-first sync queue';
      };
      refresh();
      const spacer = bar.querySelector('.sp');
      if (spacer) bar.insertBefore(badge, spacer);
      else bar.appendChild(badge);
      window.addEventListener('storage', refresh);
      setInterval(refresh, 5000);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }

  window.PMSyncQueue = {
    enqueueSyncAction,
    getPendingSyncActions,
    markSyncActionSynced,
    markSyncActionFailed,
    getSyncStatus,
    mountSyncStatus
  };

  mountSyncStatus();
})();
