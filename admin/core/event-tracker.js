// Product and presentation event tracker. Safe local queue, backend-ready later.
(function() {
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
    'property_shared_whatsapp'
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
      const data = adapter() ? adapter().getData() : (window.CRM && window.CRM.getCRM && window.CRM.getCRM());
      if (!data) return null;
      const dealer = adapter() ? adapter().getCurrentDealer(data) : (data.dealers && data.dealers[0]);
      const user = adapter() ? adapter().getCurrentUser(data) : (data.users && data.users[0]);
      const safePayload = sanitizePayload(payload || {});
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
        metadata: safePayload.metadata || {},
        createdAt: new Date().toISOString(),
        syncStatus: 'pending'
      };
      if (!event.sessionId) {
        event.sessionId = `ps-${Math.random().toString(36).slice(2, 11)}`;
        sessionStorage.setItem('plotmap_presentation_session', event.sessionId);
      }
      if (!Array.isArray(data.presentationEvents)) data.presentationEvents = [];
      data.presentationEvents.push(event);
      if (!Array.isArray(data.events)) data.events = [];
      data.events.push({
        id: event.id.replace('pevt', 'evt'),
        type: eventType,
        timestamp: Date.now(),
        staffId: event.userId,
        clientId: event.clientId,
        propertyId: event.propertyId,
        area: event.area,
        mapId: safePayload.mapId || null,
        metadata: event.metadata,
        demo: false
      });
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
      return event;
    } catch (err) {
      console.warn('PlotMap event tracking unavailable', err);
      return null;
    }
  }

  window.PMEventTracker = {
    sanitizePayload,
    trackPresentationEvent
  };
})();
