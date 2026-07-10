// Product and presentation event tracker. Safe local queue, backend-ready later.
(function() {
  // Dealer-side product usage events (admin pages). Same pipeline and
  // table as presentation events — presentation_events is the single
  // analytics stream; metadata.surface distinguishes admin usage.
  const PRODUCT_EVENTS = new Set([
    'dealer_login',
    'dealer_dashboard_opened',
    'team_workspace_opened',
    'properties_page_opened',
    'map_studio_opened',
    'clients_page_opened',
    'insights_page_opened',
    'property_add_clicked',
    'property_added',
    'admin_page_opened'
  ]);

  const PRESENTATION_EVENTS = new Set([
    'presentation_opened',
    'property_selected',
    'property_shared',
    'brochure_shared',
    'area_viewed',
    'sector_viewed',
    'original_proof_clicked',
    'sector_proof_clicked',
    'inventory_opened',
    'client_panel_opened',
    'followup_created_from_presentation',
    'map_opened',
    'property_viewed',
    'property_shared_whatsapp',
    'overlay_selected'
  ]);

  const BLOCKED_KEYS = new Set([
    'price', 'budget', 'ownerContact', 'sellerContact', 'commission', 'finance',
    'internalNotes', 'notesInternal', 'notes', 'staffData'
  ]);

  function adapter() {
    return window.PMDataAdapter || null;
  }

  function sanitizeValue(value) {
    if (Array.isArray(value)) return value.map(sanitizeValue).slice(0, 30);
    if (value && typeof value === 'object') return sanitizePayload(value);
    if (typeof value === 'string') {
      return value.replace(/(price|budget|commission|seller|owner contact|internal notes?|finance)/ig, '').slice(0, 300);
    }
    return value;
  }

  function sanitizePayload(payload) {
    const out = {};
    Object.keys(payload || {}).forEach(key => {
      if (BLOCKED_KEYS.has(key)) return;
      out[key] = sanitizeValue(payload[key]);
    });
    return out;
  }

  function trackPresentationEvent(eventType, payload) {
    try {
      if (!PRESENTATION_EVENTS.has(eventType)) return null;
      if (!/^\/app\/plotmap\/?$/i.test(location.pathname || '')) return null;
      const data = adapter() ? adapter().getData() : (window.CRM && window.CRM.getCRM && window.CRM.getCRM());
      if (!data) return null;
      const dealer = adapter() ? adapter().getCurrentDealer(data) : (data.dealers && data.dealers[0]);
      const user = adapter() ? adapter().getCurrentUser(data) : (data.users && data.users[0]);
      const safePayload = sanitizePayload(payload || {});
      const metadata = Object.assign({ source: 'client_presentation' }, safePayload.metadata || {});
      const event = {
        id: adapter() ? adapter().generateId('pevt') : `pevt-${Math.random().toString(36).slice(2, 11)}`,
        dealerId: safePayload.dealerId || (dealer && dealer.id) || null,
        userId: safePayload.userId || (user && user.id) || 'presentation',
        sessionId: safePayload.sessionId || sessionStorage.getItem('plotmap_presentation_session') || '',
        eventType,
        clientId: safePayload.clientId || null,
        propertyId: safePayload.propertyId || null,
        area: safePayload.area || null,
        sector: safePayload.sector || null,
        metadata,
        createdAt: new Date().toISOString(),
        syncStatus: 'pending'
      };
      if (!event.sessionId) {
        event.sessionId = `ps-${Math.random().toString(36).slice(2, 11)}`;
        sessionStorage.setItem('plotmap_presentation_session', event.sessionId);
      }
      if (!Array.isArray(data.presentationEvents)) data.presentationEvents = [];
      data.presentationEvents.push(event);
      if (adapter()) adapter().saveData(data);
      else if (window.CRM && window.CRM.saveCRM) window.CRM.saveCRM(data);
      if (window.PMSyncQueue) {
        window.PMSyncQueue.enqueueSyncAction({
          dealerId: event.dealerId,
          entityType: 'presentationEvents',
          entityId: event.id,
          actionType: 'create',
          payload: event
        });
      }
      if (window.PMSupaSync && typeof window.PMSupaSync.requestDrain === 'function') {
        window.PMSupaSync.requestDrain();
      }
      return event;
    } catch (err) {
      console.warn('PlotMap event tracking unavailable', err);
      return null;
    }
  }

  // Dealer-side product usage event (admin pages only). Mirrors
  // trackPresentationEvent but: (1) only fires on /admin/ routes,
  // (2) resolves dealer from the authenticated profile mirror
  // (plotmap_dealer_id — guardPage re-stamps it from the Supabase
  // profile on every admin page load), (3) tags metadata.surface='admin'.
  // Failures never surface to the UI; the server re-validates dealer
  // status inside plotmap_record_presentation_event.
  function trackProductEvent(eventType, payload) {
    try {
      if (!PRODUCT_EVENTS.has(eventType)) return null;
      if (!/^\/admin\//i.test(location.pathname || '')) return null;
      // never record developer/platform surfaces into dealer analytics
      if (/\/admin\/developer\.html$/i.test(location.pathname || '')) return null;
      const dealerId = localStorage.getItem('plotmap_dealer_id') || null;
      if (!dealerId) return null;
      let sessionId = sessionStorage.getItem('plotmap_admin_session') || '';
      if (!sessionId) {
        sessionId = `as-${Math.random().toString(36).slice(2, 11)}`;
        sessionStorage.setItem('plotmap_admin_session', sessionId);
      }
      const safePayload = sanitizePayload(payload || {});
      const metadata = Object.assign({ surface: 'admin' }, safePayload.metadata || {});
      const event = {
        id: adapter() ? adapter().generateId('pevt') : `pevt-${Math.random().toString(36).slice(2, 11)}`,
        dealerId,
        userId: localStorage.getItem('plotmap_user_id') || 'admin',
        sessionId,
        eventType,
        clientId: null,
        propertyId: safePayload.propertyId || null,
        area: safePayload.area || null,
        sector: safePayload.sector || null,
        metadata,
        createdAt: new Date().toISOString(),
        syncStatus: 'pending'
      };
      const data = adapter() ? adapter().getData() : (window.CRM && window.CRM.getCRM && window.CRM.getCRM());
      if (data) {
        if (!Array.isArray(data.presentationEvents)) data.presentationEvents = [];
        data.presentationEvents.push(event);
        if (adapter()) adapter().saveData(data);
        else if (window.CRM && window.CRM.saveCRM) window.CRM.saveCRM(data);
      }
      if (window.PMSyncQueue) {
        window.PMSyncQueue.enqueueSyncAction({
          dealerId: event.dealerId,
          entityType: 'presentationEvents',
          entityId: event.id,
          actionType: 'create',
          payload: event
        });
      }
      if (window.PMSupaSync && typeof window.PMSupaSync.requestDrain === 'function') {
        window.PMSupaSync.requestDrain();
      }
      return event;
    } catch (err) {
      return null;
    }
  }

  // One product event per admin pageview, keyed by the nav page key.
  const PAGE_OPEN_EVENTS = {
    dashboard: 'dealer_dashboard_opened',
    workspace: 'team_workspace_opened',
    properties: 'properties_page_opened',
    'map-studio': 'map_studio_opened',
    'client-details': 'clients_page_opened',
    'area-intelligence': 'insights_page_opened',
    'property-insights': 'insights_page_opened'
  };

  function trackAdminPageOpen(pageKey) {
    const eventType = PAGE_OPEN_EVENTS[pageKey] || 'admin_page_opened';
    return trackProductEvent(eventType, { metadata: { page: String(pageKey || 'unknown').slice(0, 60) } });
  }

  window.PMEventTracker = {
    sanitizePayload,
    trackPresentationEvent,
    trackProductEvent,
    trackAdminPageOpen
  };
})();
