// CRM Store using LocalStorage
(function() {
  const STORE_KEY = 'plotmap_crm_v1';

  function generateId(prefix) {
    return prefix + '-' + Math.random().toString(36).substr(2, 9);
  }

  function loadCRM() {
    try {
      const data = localStorage.getItem(STORE_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load CRM data', e);
    }
    return null;
  }

  function saveCRM(data) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save CRM data', e);
    }
  }

  function getCRM() {
    let data = loadCRM();
    if (!data) {
      data = JSON.parse(JSON.stringify(window.CRM_DEMO || {}));
      saveCRM(data);
    }
    // Ensure collections exist
    ['staff', 'areas', 'clients', 'properties', 'followups', 'siteVisits', 'deals', 'events', 'pins'].forEach(k => {
      if (!data[k]) data[k] = [];
    });
    return data;
  }

  function resetCRMToDemo() {
    const data = JSON.parse(JSON.stringify(window.CRM_DEMO || {}));
    saveCRM(data);
    return data;
  }

  function addClient(client) {
    const data = getCRM();
    const newClient = { ...client, id: generateId('c'), lastActivityAt: Date.now(), demo: false };
    data.clients.push(newClient);
    saveCRM(data);
    logEvent('client_added', { clientId: newClient.id }, newClient.assignedStaff);
    return newClient;
  }

  function updateClientStatus(clientId, status) {
    const data = getCRM();
    const client = data.clients.find(c => c.id === clientId);
    if (client) {
      client.status = status;
      client.lastActivityAt = Date.now();
      saveCRM(data);
      logEvent('client_status_changed', { clientId, status }, client.assignedStaff);
    }
  }

  function addProperty(property) {
    const data = getCRM();
    const newProp = { ...property, id: generateId('p'), internalStatus: property.internalStatus || 'Available', demo: false };
    data.properties.push(newProp);
    saveCRM(data);
    logEvent('property_added', { propertyId: newProp.id }, null);
    return newProp;
  }

  function archiveProperty(propertyId) {
    const data = getCRM();
    const prop = data.properties.find(p => p.id === propertyId);
    if (prop) {
      prop.internalStatus = 'Archived';
      saveCRM(data);
      logEvent('property_archived', { propertyId }, null);
    }
  }

  function addFollowup(followup) {
    const data = getCRM();
    const newFw = { ...followup, id: generateId('f'), status: 'pending', demo: false };
    data.followups.push(newFw);
    saveCRM(data);
    logEvent('followup_created', { followupId: newFw.id, clientId: newFw.clientId }, newFw.assignedStaffId);
    return newFw;
  }

  function updateFollowupStatus(followupId, status) {
    const data = getCRM();
    const fw = data.followups.find(f => f.id === followupId);
    if (fw) {
      fw.status = status;
      saveCRM(data);
      if (status === 'done') logEvent('followup_completed', { followupId, clientId: fw.clientId }, fw.assignedStaffId);
      if (status === 'missed') logEvent('followup_missed', { followupId, clientId: fw.clientId }, fw.assignedStaffId);
    }
  }

  function addSiteVisit(siteVisit) {
    const data = getCRM();
    const newSv = { ...siteVisit, id: generateId('sv'), status: 'scheduled', demo: false };
    data.siteVisits.push(newSv);
    saveCRM(data);
    logEvent('site_visit_scheduled', { siteVisitId: newSv.id, clientId: newSv.clientId }, newSv.assignedStaffId);
    return newSv;
  }

  function updateSiteVisitStatus(siteVisitId, status) {
    const data = getCRM();
    const sv = data.siteVisits.find(s => s.id === siteVisitId);
    if (sv) {
      sv.status = status;
      saveCRM(data);
      if (status === 'completed') logEvent('site_visit_completed', { siteVisitId, clientId: sv.clientId }, sv.assignedStaffId);
    }
  }

  function addDeal(deal) {
    const data = getCRM();
    const newDeal = { ...deal, id: generateId('d'), dealDate: new Date().toISOString(), status: 'Closed', demo: false };
    data.deals.push(newDeal);
    saveCRM(data);
    logEvent('deal_closed', { dealId: newDeal.id, clientId: newDeal.clientId }, newDeal.staffId);
    if (newDeal.commissionAmount > 0) {
      logEvent('commission_added', { dealId: newDeal.id, amount: newDeal.commissionAmount }, newDeal.staffId);
    }
    return newDeal;
  }

  function logEvent(type, meta = {}, staffId = null) {
    const data = getCRM();
    const event = {
      id: generateId('evt'),
      type,
      timestamp: Date.now(),
      staffId: staffId || 'unknown',
      clientId: meta.clientId || null,
      propertyId: meta.propertyId || null,
      area: meta.area || null,
      mapId: meta.mapId || null,
      metadata: meta,
      demo: false
    };
    data.events.push(event);
    saveCRM(data);
  }

  // --- Insight Computations ---

  function computeOwnerInsights() {
    const data = getCRM();
    const now = Date.now();
    const oneDay = 86400000;
    
    let activeClients = data.clients.filter(c => c.status !== 'Closed' && c.status !== 'Lost' && c.status !== 'Not Answering');
    let warmClients = activeClients.filter(c => ['Warm', 'Property Shared', 'Site Visit Planned'].includes(c.status));
    let silentClients = data.clients.filter(c => c.status === 'Not Answering' || (now - c.lastActivityAt > oneDay * 7 && c.status !== 'Closed'));
    
    let todayFollowups = data.followups.filter(f => f.status === 'pending' && new Date(f.dateTime).getTime() < now + oneDay);
    let todayVisits = data.siteVisits.filter(s => s.status === 'scheduled' && new Date(s.dateTime).getTime() < now + oneDay);
    
    // AI Business Pulse
    let pulseText = `Based on your PlotMap activity today, `;
    if (warmClients.length > 0) pulseText += `${warmClients.length} warm clients need attention. `;
    if (todayVisits.length > 0) pulseText += `${todayVisits.length} site visits are scheduled. `;
    if (silentClients.length > 0) pulseText += `${silentClients.length} clients went silent recently. `;
    if (warmClients.length === 0 && todayVisits.length === 0) pulseText += `things are quiet. Add more properties or clients to build pipeline.`;

    return {
      pulseText,
      activeClients: activeClients.length,
      warmClients: warmClients.length,
      silentClients: silentClients.length,
      todayFollowups: todayFollowups.length,
      todayVisits: todayVisits.length
    };
  }

  function computeAreaInsights() {
    const data = getCRM();
    const areas = {};
    data.areas.forEach(a => areas[a] = { interest: 0, views: 0, deals: 0 });
    
    data.clients.forEach(c => {
      if (c.interestedArea && areas[c.interestedArea]) areas[c.interestedArea].interest += 1;
    });
    
    data.events.forEach(e => {
      if (e.area && areas[e.area]) {
        if (e.type === 'property_viewed' || e.type.includes('map_opened')) areas[e.area].views += 1;
      }
    });
    
    data.deals.forEach(d => {
      if (d.area && areas[d.area]) areas[d.area].deals += 1;
    });
    
    return areas;
  }

  function computeFinanceTotals() {
    const data = getCRM();
    let totalDealValue = 0, commissionEarned = 0, commissionReceived = 0, commissionPending = 0;
    
    data.deals.forEach(d => {
      totalDealValue += Number(d.dealValue) || 0;
      commissionEarned += Number(d.commissionAmount) || 0;
      commissionReceived += Number(d.commissionReceived) || 0;
      commissionPending += Number(d.commissionPending) || 0;
    });
    
    return {
      dealsClosed: data.deals.length,
      totalDealValue,
      commissionEarned,
      commissionReceived,
      commissionPending
    };
  }

  window.CRM = {
    loadCRM, saveCRM, getCRM, resetCRMToDemo,
    addClient, updateClientStatus,
    addProperty, archiveProperty,
    addFollowup, updateFollowupStatus,
    addSiteVisit, updateSiteVisitStatus,
    addDeal,
    logEvent,
    computeOwnerInsights, computeAreaInsights, computeFinanceTotals
  };
})();
