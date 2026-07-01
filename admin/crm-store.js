// CRM Store using LocalStorage
(function() {
  const STORE_KEY = 'plotmap_crm_v1';
  const DEFAULT_DEALER_ID = 'dealer-demo';
  const DEFAULT_OWNER_ID = 'user-owner-demo';
  const FOUNDATION_COLLECTIONS = [
    'dealers', 'users', 'accessLinks', 'staff', 'areas', 'clients', 'properties',
    'followups', 'siteVisits', 'deals', 'events', 'presentationEvents', 'reports',
    'pins', 'mapDrawings', 'syncQueue'
  ];

  function generateId(prefix) {
    return prefix + '-' + Math.random().toString(36).substr(2, 9);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function firstDealerId(data) {
    return (data.dealers && data.dealers[0] && data.dealers[0].id) || DEFAULT_DEALER_ID;
  }

  function ensureCollections(data) {
    FOUNDATION_COLLECTIONS.forEach(k => {
      if (!Array.isArray(data[k])) data[k] = [];
    });
    if (!data.syncMeta || typeof data.syncMeta !== 'object') {
      data.syncMeta = { lastSyncedAt: null, pendingCount: 0, failedCount: 0, offlineGraceHours: 24 };
    }
  }

  function ensureFoundationData(data) {
    data = data || {};
    ensureCollections(data);
    const createdAt = nowIso();
    if (!data.dealers.length) {
      data.dealers.push({
        id: DEFAULT_DEALER_ID,
        name: 'Demo Dealer',
        slug: 'demo-dealer',
        businessName: 'PlotMap Demo Realty',
        phone: '',
        email: '',
        status: 'trial',
        trialStart: createdAt,
        trialEnd: new Date(Date.now() + 14 * 86400000).toISOString(),
        createdAt,
        updatedAt: createdAt
      });
    }
    if (!data.users.length) {
      data.users.push({
        id: DEFAULT_OWNER_ID,
        dealerId: firstDealerId(data),
        name: 'Owner',
        phone: '',
        email: '',
        role: 'owner',
        status: 'active',
        lastAccessCheck: createdAt,
        lastLogin: createdAt,
        createdAt,
        updatedAt: createdAt
      });
    }
    if (!data.accessLinks.length) {
      data.accessLinks.push({
        id: 'link-demo-owner',
        dealerId: firstDealerId(data),
        createdBy: data.users[0].id,
        token: 'demo-owner',
        label: 'Demo Owner Trial',
        roleAllowed: 'owner',
        expiresAt: data.dealers[0].trialEnd,
        maxUses: 100,
        useCount: 0,
        status: 'active',
        createdAt,
        updatedAt: createdAt
      });
    }
    normalizeEntities(data);
    data.syncMeta.pendingCount = data.syncQueue.filter(item => item.status === 'pending').length;
    data.syncMeta.failedCount = data.syncQueue.filter(item => item.status === 'failed').length;
    return data;
  }

  function normalizeEntities(data) {
    const dealerId = firstDealerId(data);
    data.clients.forEach(client => {
      client.dealerId = client.dealerId || dealerId;
      client.requirement = client.requirement || client.sizeRequirement || client.propertyType || '';
      client.interestedSector = client.interestedSector || client.sector || '';
      client.assignedStaff = client.assignedStaff || client.assignedStaffId || '';
      client.notesInternal = client.notesInternal || client.notes || '';
      client.createdAt = client.createdAt || new Date(client.lastActivityAt || Date.now()).toISOString();
      client.updatedAt = client.updatedAt || client.createdAt;
      client.syncStatus = client.syncStatus || 'synced';
    });
    data.properties.forEach(property => {
      property.dealerId = property.dealerId || dealerId;
      property.propertyCode = property.propertyCode || property.id;
      property.block = property.block || property.sector || '';
      property.propertyType = property.propertyType || property.type || '';
      property.photos = Array.isArray(property.photos) ? property.photos : [];
      property.photoStatus = property.photoStatus || (property.photos.length ? 'available' : 'missing');
      property.proofMapStatus = property.proofMapStatus || (property.sectorMapId || property.sectorMapLink ? 'linked' : '');
      property.masterMapId = property.masterMapId || property.originalMapLink || '';
      property.sectorMapId = property.sectorMapId || property.sectorMapLink || '';
      property.masterMapPosition = property.masterMapPosition || null;
      property.sectorMapPosition = property.sectorMapPosition || null;
      property.internalNotes = property.internalNotes || property.notes || '';
      property.createdAt = property.createdAt || nowIso();
      property.updatedAt = property.updatedAt || property.createdAt;
      property.syncStatus = property.syncStatus || 'synced';
    });
    data.followups.forEach(item => {
      item.dealerId = item.dealerId || dealerId;
      item.dueDate = item.dueDate || item.dateTime || '';
      item.assignedStaff = item.assignedStaff || item.assignedStaffId || '';
      item.createdAt = item.createdAt || nowIso();
      item.updatedAt = item.updatedAt || item.createdAt;
      item.syncStatus = item.syncStatus || 'synced';
    });
    data.siteVisits.forEach(item => {
      item.dealerId = item.dealerId || dealerId;
      item.date = item.date || item.dateTime || '';
      item.assignedStaff = item.assignedStaff || item.assignedStaffId || '';
      item.createdAt = item.createdAt || nowIso();
      item.updatedAt = item.updatedAt || item.createdAt;
      item.syncStatus = item.syncStatus || 'synced';
    });
    data.deals.forEach(item => {
      item.dealerId = item.dealerId || dealerId;
      item.commissionExpected = Number(item.commissionExpected || item.commissionAmount || 0);
      item.commissionReceived = Number(item.commissionReceived || 0);
      item.commissionPending = Number(item.commissionPending || Math.max(0, item.commissionExpected - item.commissionReceived));
      item.closedAt = item.closedAt || item.dealDate || '';
      item.createdAt = item.createdAt || item.dealDate || nowIso();
      item.updatedAt = item.updatedAt || item.createdAt;
      item.syncStatus = item.syncStatus || 'synced';
    });
  }

  function enqueueChange(data, entityType, entityId, actionType, payload) {
    data.syncQueue.push({
      id: generateId('sync'),
      dealerId: firstDealerId(data),
      entityType,
      entityId,
      actionType,
      payload,
      createdAt: nowIso(),
      status: 'pending',
      retryCount: 0
    });
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
      localStorage.setItem(STORE_KEY, JSON.stringify(ensureFoundationData(data)));
    } catch (e) {
      console.error('Failed to save CRM data', e);
    }
  }

  function getCRM() {
    let data = loadCRM();
    if (!data) {
      data = JSON.parse(JSON.stringify(window.CRM_DEMO || {}));
    }
    data = ensureFoundationData(data);
    saveCRM(data);
    return data;
  }

  function resetCRMToDemo() {
    const data = ensureFoundationData(JSON.parse(JSON.stringify(window.CRM_DEMO || {})));
    saveCRM(data);
    return data;
  }

  function addClient(client) {
    const data = getCRM();
    const ts = nowIso();
    const newClient = { ...client, id: generateId('c'), dealerId: firstDealerId(data), lastActivityAt: Date.now(), createdAt: ts, updatedAt: ts, syncStatus: 'pending', demo: false };
    data.clients.push(newClient);
    enqueueChange(data, 'clients', newClient.id, 'create', newClient);
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
      client.updatedAt = nowIso();
      client.syncStatus = 'pending';
      enqueueChange(data, 'clients', clientId, 'update', { status });
      saveCRM(data);
      logEvent('client_status_changed', { clientId, status }, client.assignedStaff);
    }
  }

  function addProperty(property) {
    const data = getCRM();
    const ts = nowIso();
    const newProp = { ...property, id: generateId('p'), dealerId: firstDealerId(data), internalStatus: property.internalStatus || 'Available', createdAt: ts, updatedAt: ts, syncStatus: 'pending', demo: false };
    data.properties.push(newProp);
    enqueueChange(data, 'properties', newProp.id, 'create', newProp);
    saveCRM(data);
    logEvent('property_added', { propertyId: newProp.id }, null);
    return newProp;
  }

  function archiveProperty(propertyId) {
    const data = getCRM();
    const prop = data.properties.find(p => p.id === propertyId);
    if (prop) {
      prop.internalStatus = 'Archived';
      prop.updatedAt = nowIso();
      prop.syncStatus = 'pending';
      enqueueChange(data, 'properties', propertyId, 'archive', { internalStatus: 'Archived' });
      saveCRM(data);
      logEvent('property_archived', { propertyId }, null);
    }
  }

  function addFollowup(followup) {
    const data = getCRM();
    const ts = nowIso();
    const newFw = { ...followup, id: generateId('f'), dealerId: firstDealerId(data), status: followup.status || 'pending', dueDate: followup.dueDate || followup.dateTime || '', createdAt: ts, updatedAt: ts, syncStatus: 'pending', demo: false };
    data.followups.push(newFw);
    enqueueChange(data, 'followups', newFw.id, 'create', newFw);
    saveCRM(data);
    logEvent('followup_created', { followupId: newFw.id, clientId: newFw.clientId }, newFw.assignedStaffId);
    return newFw;
  }

  function updateFollowupStatus(followupId, status) {
    const data = getCRM();
    const fw = data.followups.find(f => f.id === followupId);
    if (fw) {
      fw.status = status;
      fw.updatedAt = nowIso();
      fw.syncStatus = 'pending';
      enqueueChange(data, 'followups', followupId, 'update', { status });
      saveCRM(data);
      if (status === 'done') logEvent('followup_completed', { followupId, clientId: fw.clientId }, fw.assignedStaffId);
      if (status === 'missed') logEvent('followup_missed', { followupId, clientId: fw.clientId }, fw.assignedStaffId);
    }
  }

  function addSiteVisit(siteVisit) {
    const data = getCRM();
    const ts = nowIso();
    const newSv = { ...siteVisit, id: generateId('sv'), dealerId: firstDealerId(data), status: siteVisit.status || 'scheduled', date: siteVisit.date || siteVisit.dateTime || '', createdAt: ts, updatedAt: ts, syncStatus: 'pending', demo: false };
    data.siteVisits.push(newSv);
    enqueueChange(data, 'siteVisits', newSv.id, 'create', newSv);
    saveCRM(data);
    logEvent('site_visit_scheduled', { siteVisitId: newSv.id, clientId: newSv.clientId }, newSv.assignedStaffId);
    return newSv;
  }

  function updateSiteVisitStatus(siteVisitId, status) {
    const data = getCRM();
    const sv = data.siteVisits.find(s => s.id === siteVisitId);
    if (sv) {
      sv.status = status;
      sv.updatedAt = nowIso();
      sv.syncStatus = 'pending';
      enqueueChange(data, 'siteVisits', siteVisitId, 'update', { status });
      saveCRM(data);
      if (status === 'completed') logEvent('site_visit_completed', { siteVisitId, clientId: sv.clientId }, sv.assignedStaffId);
    }
  }

  function addDeal(deal) {
    const data = getCRM();
    const ts = nowIso();
    const expected = Number(deal.commissionExpected || deal.commissionAmount || 0);
    const received = Number(deal.commissionReceived || 0);
    const newDeal = { ...deal, id: generateId('d'), dealerId: firstDealerId(data), dealDate: ts, closedAt: ts, commissionExpected: expected, commissionAmount: expected, commissionReceived: received, commissionPending: Number(deal.commissionPending || Math.max(0, expected - received)), status: deal.status || 'Closed', createdAt: ts, updatedAt: ts, syncStatus: 'pending', demo: false };
    data.deals.push(newDeal);
    enqueueChange(data, 'deals', newDeal.id, 'create', newDeal);
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
      dealerId: firstDealerId(data),
      type,
      timestamp: Date.now(),
      staffId: staffId || 'unknown',
      clientId: meta.clientId || null,
      propertyId: meta.propertyId || null,
      area: meta.area || null,
      mapId: meta.mapId || null,
      metadata: meta,
      createdAt: nowIso(),
      syncStatus: 'pending',
      demo: false
    };
    data.events.push(event);
    enqueueChange(data, 'events', event.id, 'create', event);
    saveCRM(data);
  }

  function getPropertyReadiness(property) {
    if (window.PMCommandEngine && typeof window.PMCommandEngine.getPropertyReadiness === 'function') {
      return window.PMCommandEngine.getPropertyReadiness(property);
    }
    const photosMissing = !Array.isArray(property.photos) || property.photos.length === 0 || property.photoStatus === 'missing';
    const mapPinMissing = !property.mapPinStatus || /unpin|missing/i.test(property.mapPinStatus);
    const sectorProofMissing = !property.sectorMapId && !property.sectorMapLink && !property.proofMapStatus;
    const readyToPresent = !photosMissing && !mapPinMissing && !sectorProofMissing && !/archived|hold/i.test(property.internalStatus || '');
    return {
      propertyId: property.id,
      photosMissing,
      mapPinMissing,
      sectorProofMissing,
      readyToPresent,
      needsReview: !readyToPresent
    };
  }

  function createAccessLink(input) {
    if (window.PMAccess && typeof window.PMAccess.createAccessLink === 'function') {
      return window.PMAccess.createAccessLink(input);
    }
    const data = getCRM();
    const ts = nowIso();
    const link = {
      id: generateId('link'),
      dealerId: firstDealerId(data),
      createdBy: DEFAULT_OWNER_ID,
      token: generateId('trial'),
      label: 'Trial Link',
      roleAllowed: 'viewer',
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      maxUses: 1,
      useCount: 0,
      status: 'active',
      createdAt: ts,
      updatedAt: ts,
      ...(input || {})
    };
    data.accessLinks.push(link);
    enqueueChange(data, 'accessLinks', link.id, 'create', link);
    saveCRM(data);
    return link;
  }

  function updateAccessLink(id, changes) {
    const data = getCRM();
    const link = data.accessLinks.find(item => item.id === id);
    if (!link) return null;
    Object.assign(link, changes || {}, { updatedAt: nowIso() });
    enqueueChange(data, 'accessLinks', id, 'update', changes || {});
    saveCRM(data);
    return link;
  }

  function revokeAccessLink(id) {
    return updateAccessLink(id, { status: 'revoked' });
  }

  function expireAccessLink(id) {
    return updateAccessLink(id, { status: 'expired', expiresAt: nowIso() });
  }

  function extendAccessLink(id, days) {
    const data = getCRM();
    const link = data.accessLinks.find(item => item.id === id);
    if (!link) return null;
    const base = new Date(link.expiresAt || Date.now()).getTime();
    const start = Number.isFinite(base) && base > Date.now() ? base : Date.now();
    link.expiresAt = new Date(start + Number(days || 7) * 86400000).toISOString();
    link.status = 'active';
    link.updatedAt = nowIso();
    enqueueChange(data, 'accessLinks', id, 'extend', { expiresAt: link.expiresAt, status: link.status });
    saveCRM(data);
    return link;
  }

  function updateUserStatus(userId, status) {
    const data = getCRM();
    const user = data.users.find(item => item.id === userId);
    if (!user) return null;
    user.status = status || 'active';
    user.updatedAt = nowIso();
    enqueueChange(data, 'users', userId, 'status_update', { status: user.status });
    saveCRM(data);
    return user;
  }

  function blockUser(userId) {
    return updateUserStatus(userId, 'blocked');
  }

  function unblockUser(userId) {
    return updateUserStatus(userId, 'active');
  }

  function expireUser(userId) {
    return updateUserStatus(userId, 'expired');
  }

  function removeUser(userId) {
    return updateUserStatus(userId, 'removed');
  }

  function extendTrial(dealerId, days) {
    const data = getCRM();
    const dealer = data.dealers.find(item => item.id === dealerId) || data.dealers[0];
    if (!dealer) return null;
    dealer.status = 'trial';
    dealer.trialEnd = new Date(Date.now() + Number(days || 7) * 86400000).toISOString();
    dealer.updatedAt = nowIso();
    enqueueChange(data, 'dealers', dealer.id, 'extend_trial', { trialEnd: dealer.trialEnd });
    saveCRM(data);
    return dealer;
  }

  function computeDealerCommandInsights() {
    const data = getCRM();
    return window.PMCommandEngine ? window.PMCommandEngine.computeDealerCommandInsights(data) : computeOwnerInsights();
  }

  function generateDailyOwnerReport(dealerId, date) {
    if (window.PMReportEngine && typeof window.PMReportEngine.generateDailyOwnerReport === 'function') {
      return window.PMReportEngine.generateDailyOwnerReport(dealerId || firstDealerId(getCRM()), date);
    }
    const data = getCRM();
    const report = {
      id: generateId('rep'),
      dealerId: dealerId || firstDealerId(data),
      reportType: 'daily',
      reportDate: date || new Date().toISOString().slice(0, 10),
      summary: computeOwnerInsights().pulseText,
      metricsJson: computeOwnerInsights(),
      aiText: computeOwnerInsights().pulseText,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    data.reports.push(report);
    saveCRM(data);
    return report;
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
    // Need to find highest interest area
    const areaInterest = {};
    data.clients.forEach(c => { if(c.interestedArea) areaInterest[c.interestedArea] = (areaInterest[c.interestedArea]||0) + 1; });
    const topArea = Object.keys(areaInterest).sort((a,b)=>areaInterest[b]-areaInterest[a])[0];

    let pulseText = `Based on your PlotMap activity today, ${topArea ? topArea + ' is receiving the strongest client attention. ' : ''}`;
    if (warmClients.length > 0) pulseText += `${warmClients.length} warm clients need follow-up. `;
    if (silentClients.length > 0) pulseText += `${silentClients.length} clients went silent recently. `;
    if (todayVisits.length > 0) pulseText += `${todayVisits.length} site visits are scheduled. `;
    if (warmClients.length === 0 && todayVisits.length === 0) pulseText += `Things are quiet today.`;

    // Priority Clients
    const priorityClients = data.clients
      .filter(c => ['Warm', 'Property Shared', 'Site Visit Planned', 'Negotiation'].includes(c.status))
      .sort((a,b) => b.lastActivityAt - a.lastActivityAt)
      .slice(0, 5)
      .map(c => {
        let reason = 'Warm lead';
        if (c.status === 'Negotiation') reason = 'Closing soon';
        else if (c.status === 'Site Visit Planned') reason = 'Site visit pending';
        else if (c.status === 'Property Shared') reason = 'Check if they liked property';
        return { ...c, reason };
      });

    // Missed Opportunities
    const missedOpportunities = [];
    const missedFws = data.followups.filter(f => f.status === 'missed');
    missedFws.forEach(f => {
      const c = data.clients.find(cl => cl.id === f.clientId);
      if (c) missedOpportunities.push({ title: 'Missed Follow-up', desc: `${c.name} was not followed up on time.`, priority: 'high', staffId: f.assignedStaffId });
    });
    silentClients.forEach(c => {
      missedOpportunities.push({ title: 'Client went silent', desc: `${c.name} hasn't responded recently.`, priority: 'med', staffId: c.assignedStaffId });
    });
    if (missedOpportunities.length === 0) missedOpportunities.push({ title: 'Pipeline healthy', desc: 'No major leaks detected.', priority: 'low', staffId: null });

    // Client Pipeline counts
    const pipeline = {
      'New': 0, 'Warm': 0, 'Property Shared': 0, 'Site Visit Planned': 0, 'Site Visit Done': 0, 'Negotiation': 0, 'Closed': 0, 'Not Answering': 0
    };
    data.clients.forEach(c => { if(pipeline[c.status] !== undefined) pipeline[c.status]++; });

    // Staff Activity Summary
    const staffActivity = {};
    data.staff.forEach(s => { staffActivity[s.id] = { name: s.name, clients: 0, visits: 0, deals: 0 }; });
    data.clients.forEach(c => { if(staffActivity[c.assignedStaff]) staffActivity[c.assignedStaff].clients++; });
    data.siteVisits.forEach(sv => { if(staffActivity[sv.assignedStaffId]) staffActivity[sv.assignedStaffId].visits++; });
    data.deals.forEach(d => { if(staffActivity[d.staffId]) staffActivity[d.staffId].deals++; });

    return {
      pulseText,
      topArea,
      activeClients: activeClients.length,
      warmClients: warmClients.length,
      silentClients: silentClients.length,
      todayFollowups: todayFollowups.length,
      todayVisits: todayVisits.length,
      priorityClients,
      missedOpportunities,
      pipeline,
      staffActivity: Object.values(staffActivity)
    };
  }

  function computeAreaInsights() {
    const data = getCRM();
    const areas = {};
    data.areas.forEach(a => areas[a] = { interest: 0, views: 0, deals: 0, shares: 0, siteVisits: 0, inventory: 0, mapOpens: 0 });
    
    data.clients.forEach(c => {
      if (c.interestedArea && areas[c.interestedArea]) areas[c.interestedArea].interest += 1;
    });
    
    data.events.forEach(e => {
      if (e.area && areas[e.area]) {
        if (e.type === 'property_viewed') areas[e.area].views += 1;
        if (e.type.includes('map_opened')) areas[e.area].mapOpens += 1;
        if (e.type.includes('property_shared')) areas[e.area].shares += 1;
      }
    });
    
    data.siteVisits.forEach(sv => {
      if (sv.area && areas[sv.area]) areas[sv.area].siteVisits += 1;
    });

    data.deals.forEach(d => {
      if (d.area && areas[d.area]) areas[d.area].deals += 1;
    });

    data.properties.forEach(p => {
      if (p.area && areas[p.area] && p.internalStatus === 'Available') areas[p.area].inventory += 1;
    });

    const enrichedAreas = Object.keys(areas).map(k => {
      const a = areas[k];
      let status = 'Low Activity';
      let gap = 'stable demand, low inventory';
      if (a.interest > 2) {
        status = 'High Interest';
        gap = a.inventory < 2 ? 'high demand, low inventory' : 'high demand, stable inventory';
      } else if (a.interest > 0 || a.views > 0) {
        status = 'Rising';
      }
      return {
        name: k,
        ...a,
        status,
        gap,
        summary: `Based on PlotMap activity, ${k} has ${a.interest} client requirements and ${a.inventory} available properties.`
      };
    });

    return enrichedAreas.sort((a,b) => b.interest - a.interest);
  }

  function computeFinanceTotals() {
    const data = getCRM();
    if (window.PMFinanceEngine && typeof window.PMFinanceEngine.computeFinanceSummary === 'function') {
      const summary = window.PMFinanceEngine.computeFinanceSummary(data);
      return {
        dealsClosed: summary.dealsClosed,
        totalDealValue: summary.totalDealValue,
        commissionEarned: summary.commissionEarned,
        commissionReceived: summary.commissionReceived,
        commissionPending: summary.commissionPending,
        averageCommissionPerDeal: summary.averageCommissionPerDeal,
        clientRevenue: summary.clientRevenue,
        staffRevenue: summary.staffRevenue,
        areaRevenue: summary.areaRevenue,
        propertyTypeRevenue: summary.propertyTypeRevenue,
        recoveryQueue: summary.recoveryQueue,
        deadMoneyAlerts: summary.deadMoneyAlerts,
        pendingCommissionAging: summary.pendingCommissionAging
      };
    }
    let totalDealValue = 0, commissionEarned = 0, commissionReceived = 0, commissionPending = 0;
    
    const clientRev = {};
    const staffRev = {};
    const areaRev = {};

    data.deals.forEach(d => {
      totalDealValue += Number(d.dealValue) || 0;
      commissionEarned += Number(d.commissionAmount) || 0;
      commissionReceived += Number(d.commissionReceived) || 0;
      commissionPending += Number(d.commissionPending) || 0;

      if(d.clientId) {
        if(!clientRev[d.clientId]) clientRev[d.clientId] = { deals: 0, dealValue: 0, earned: 0, received: 0, pending: 0 };
        clientRev[d.clientId].deals++;
        clientRev[d.clientId].dealValue += Number(d.dealValue)||0;
        clientRev[d.clientId].earned += Number(d.commissionAmount)||0;
        clientRev[d.clientId].received += Number(d.commissionReceived)||0;
        clientRev[d.clientId].pending += Number(d.commissionPending)||0;
      }

      if(d.staffId) {
        if(!staffRev[d.staffId]) staffRev[d.staffId] = { deals: 0, earned: 0 };
        staffRev[d.staffId].deals++;
        staffRev[d.staffId].earned += Number(d.commissionAmount)||0;
      }

      if(d.area) {
        if(!areaRev[d.area]) areaRev[d.area] = { earned: 0 };
        areaRev[d.area].earned += Number(d.commissionAmount)||0;
      }
    });

    // Populate client names
    const clientsWithRev = Object.keys(clientRev).map(cid => {
      const c = data.clients.find(cl => cl.id === cid);
      return { id: cid, name: c ? c.name : 'Unknown', ...clientRev[cid] };
    }).sort((a,b) => b.earned - a.earned);

    const staffWithRev = Object.keys(staffRev).map(sid => {
      const s = data.staff.find(st => st.id === sid);
      return { name: s ? s.name : 'Unknown', ...staffRev[sid] };
    }).sort((a,b) => b.earned - a.earned);

    const areasWithRev = Object.keys(areaRev).map(area => {
      return { name: area, ...areaRev[area] };
    }).sort((a,b) => b.earned - a.earned);
    
    return {
      dealsClosed: data.deals.length,
      totalDealValue,
      commissionEarned,
      commissionReceived,
      commissionPending,
      averageCommissionPerDeal: data.deals.length ? commissionEarned / data.deals.length : 0,
      clientRevenue: clientsWithRev,
      staffRevenue: staffWithRev,
      areaRevenue: areasWithRev
    };
  }

  function getPublishedClientMapDrawings(mapId) {
    try {
      const data = loadCRM();
      const drawings = data && Array.isArray(data.mapDrawings) ? data.mapDrawings : [];
      const safeVisibility = new Set(['client-visible', 'public']);
      const safeKinds = new Set(['road', 'block', 'sectorTag']);
      const unsafeText = /(price|₹|â‚¹|\bRs\b|\bCr\b|crore|lakh|budget|sold|seller|contact|commission|finance|internal|draft|notes|checklist|staff|debug|[A-Z]:\\|\/public\/|\\)/i;
      const cleanText = (value) => {
        const text = String(value || '').trim();
        return text && !unsafeText.test(text) ? text : '';
      };
      const cleanPoint = (point) => {
        const x = Number(point && point.x);
        const y = Number(point && point.y);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) return null;
        return { x, y };
      };

      return drawings.reduce((safe, drawing) => {
        if (!drawing || drawing.mapId !== mapId) return safe;
        if (drawing.status !== 'Published') return safe;
        const visibility = String(drawing.visibility || '').trim().toLowerCase();
        const clientVisible = drawing.clientVisible === true || visibility === 'client-visible';
        if (!clientVisible || !safeVisibility.has(visibility)) return safe;
        if (!safeKinds.has(drawing.kind)) return safe;

        const rawPoints = Array.isArray(drawing.points) ? drawing.points : [];
        const points = rawPoints.map(cleanPoint).filter(Boolean);
        if (points.length !== rawPoints.length) return safe;
        if (points.length < (drawing.kind === 'road' ? 2 : 3)) return safe;

        const id = cleanText(drawing.id);
        const title = cleanText(drawing.title);
        if (!id || !title) return safe;

        safe.push({
          id,
          kind: drawing.kind,
          title,
          type: cleanText(drawing.type),
          city: cleanText(drawing.city),
          area: cleanText(drawing.area),
          mapType: cleanText(drawing.mapType),
          mapId: cleanText(drawing.mapId),
          group: cleanText(drawing.group).toUpperCase(),
          linkedSectorMapId: cleanText(drawing.linkedSectorMapId),
          points
        });
        return safe;
      }, []);
    } catch (e) {
      return [];
    }
  }

  window.CRM = {
    loadCRM, saveCRM, getCRM, resetCRMToDemo,
    addClient, updateClientStatus,
    addProperty, archiveProperty,
    addFollowup, updateFollowupStatus,
    addSiteVisit, updateSiteVisitStatus,
    addDeal,
    logEvent,
    computeOwnerInsights, computeAreaInsights, computeFinanceTotals,
    computeDealerCommandInsights,
    getPropertyReadiness,
    createAccessLink, updateAccessLink, revokeAccessLink, expireAccessLink, extendAccessLink,
    updateUserStatus, blockUser, unblockUser, expireUser, removeUser, extendTrial,
    generateDailyOwnerReport,
    getPublishedClientMapDrawings
  };
})();
