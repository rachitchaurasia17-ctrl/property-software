// Lightweight sync queue. This is not full offline sync yet.
(function() {
  const FALLBACK_KEY = 'plotmap_sync_queue_v1';
  const RETRY_BASE_MS = 15000;
  const RETRY_MAX_MS = 5 * 60 * 1000;
  const SYNCED_RETENTION_MS = 12 * 60 * 60 * 1000;

  function adapter() {
    return window.PMDataAdapter || null;
  }

  function nowIso() {
    return (adapter() && adapter().nowIso()) || new Date().toISOString();
  }

  function currentDealerId(data) {
    if (adapter() && typeof adapter().getCurrentDealerId === 'function') {
      return adapter().getCurrentDealerId(data) || null;
    }
    try {
      return localStorage.getItem('plotmap_dealer_id') || null;
    } catch (err) {
      return null;
    }
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
        pendingCount: data.syncQueue.filter(item => item.status === 'pending' || item.status === 'retrying' || item.status === 'syncing').length,
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
        dealerId: currentDealerId(),
        entityType: '',
        entityId: '',
        actionType: '',
        payload: {},
        createdAt: nowIso(),
        status: 'pending',
        retryCount: 0,
        lastError: '',
        nextRetryAt: null
      }, action || {});
      queue.push(item);
      return item;
    });
  }

  function getPendingSyncActions() {
    return withQueue(queue => queue.filter(item => {
      if (item.status === 'pending' || item.status === 'retrying') return true;
      if (item.status !== 'failed') return false;
      const nextRetryAt = item.nextRetryAt ? Date.parse(item.nextRetryAt) : 0;
      return !nextRetryAt || nextRetryAt <= Date.now();
    }));
  }

  function pruneSyncedSyncActions() {
    return withQueue(queue => {
      const cutoff = Date.now() - SYNCED_RETENTION_MS;
      let removed = 0;
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        const item = queue[i];
        if (!item || item.status !== 'synced') continue;
        const syncedAt = item.syncedAt ? Date.parse(item.syncedAt) : 0;
        if (!syncedAt || syncedAt > cutoff) continue;
        queue.splice(i, 1);
        removed += 1;
      }
      return removed;
    });
  }

  function markSyncActionSyncing(id) {
    return withQueue(queue => {
      const item = queue.find(entry => entry.id === id);
      if (!item) return null;
      item.status = 'syncing';
      item.lastError = '';
      return item;
    });
  }

  function markSyncActionSynced(id) {
    return withQueue((queue, data) => {
      const item = queue.find(entry => entry.id === id);
      if (!item) return null;
      item.status = 'synced';
      item.syncedAt = nowIso();
      item.nextRetryAt = null;
      if (data) data.syncMeta = Object.assign({}, data.syncMeta || {}, { lastSyncedAt: item.syncedAt });
      const cutoff = Date.now() - SYNCED_RETENTION_MS;
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        const row = queue[i];
        if (!row || row.status !== 'synced') continue;
        const syncedAt = row.syncedAt ? Date.parse(row.syncedAt) : 0;
        if (!syncedAt || syncedAt > cutoff) continue;
        queue.splice(i, 1);
      }
      return item;
    });
  }

  function nextRetryIso(retryCount) {
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.max(1, Math.pow(2, Math.max(0, Number(retryCount || 0) - 1))));
    return new Date(Date.now() + delay).toISOString();
  }

  function markSyncActionFailed(id, error) {
    return withQueue(queue => {
      const item = queue.find(entry => entry.id === id);
      if (!item) return null;
      item.status = 'failed';
      item.retryCount = Number(item.retryCount || 0) + 1;
      item.lastError = String(error || 'Sync failed').slice(0, 300);
      item.nextRetryAt = nextRetryIso(item.retryCount);
      return item;
    });
  }

  function markSyncActionRetrying(id) {
    return withQueue(queue => {
      const item = queue.find(entry => entry.id === id);
      if (!item) return null;
      item.status = 'retrying';
      return item;
    });
  }

  function retryFailedSyncActions() {
    return withQueue(queue => {
      let count = 0;
      queue.forEach(item => {
        if (item.status !== 'failed') return;
        const nextRetryAt = item.nextRetryAt ? Date.parse(item.nextRetryAt) : 0;
        if (nextRetryAt && nextRetryAt > Date.now()) return;
        item.status = 'retrying';
        count += 1;
      });
      return count;
    });
  }

  function retrySyncAction(id) {
    return withQueue(queue => {
      const item = queue.find(entry => entry.id === id);
      if (!item) return null;
      item.status = 'retrying';
      item.nextRetryAt = null;
      return item;
    });
  }

  function getSyncStatus() {
    return withQueue((queue, data) => {
      const meta = data && data.syncMeta ? data.syncMeta : {};
      return {
        lastSyncedAt: meta.lastSyncedAt || null,
        pendingCount: queue.filter(item => item.status === 'pending' || item.status === 'retrying' || item.status === 'syncing').length,
        failedCount: queue.filter(item => item.status === 'failed').length,
        syncingCount: queue.filter(item => item.status === 'syncing').length,
        retryingCount: queue.filter(item => item.status === 'retrying').length,
        offlineGraceHours: Number(meta.offlineGraceHours || 24)
      };
    });
  }

  function renderStatusText(status) {
    if (status.failedCount > 0) return `Sync failed: ${status.failedCount}`;
    if (status.syncingCount > 0) return `Syncing: ${status.syncingCount}`;
    if (status.retryingCount > 0) return `Retrying: ${status.retryingCount}`;
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
      badge.style.cursor = 'pointer';
      const refresh = () => {
        const status = getSyncStatus();
        badge.textContent = renderStatusText(status);
        badge.title = status.failedCount > 0
          ? 'Click to retry failed sync items'
          : status.lastSyncedAt ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}` : 'Local-first sync queue';
      };
      badge.addEventListener('click', () => {
        const status = getSyncStatus();
        if (status.failedCount > 0) {
          retryFailedSyncActions();
          if (window.PMSupaSync && typeof window.PMSupaSync.requestDrain === 'function') {
            window.PMSupaSync.requestDrain();
          }
          refresh();
        }
      });
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
    markSyncActionSyncing,
    markSyncActionSynced,
    markSyncActionFailed,
    markSyncActionRetrying,
    retryFailedSyncActions,
    retrySyncAction,
    getSyncStatus,
    pruneSyncedSyncActions,
    mountSyncStatus
  };

  mountSyncStatus();
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      pruneSyncedSyncActions();
      retryFailedSyncActions();
    }
  });
})();
