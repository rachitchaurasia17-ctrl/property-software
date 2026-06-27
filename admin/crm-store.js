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
    ['staff', 'areas', 'clients', 'properties', 'followups', 'siteVisits', 'deals', 'events', 'pins', 'mapDrawings'].forEach(k => {
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
      clientRevenue: clientsWithRev,
      staffRevenue: staffWithRev,
      areaRevenue: areasWithRev
    };
  }

  function getPublishedClientMapDrawings(mapId) {
    const data = getCRM();
    if (!data.mapDrawings) return [];
    return data.mapDrawings.filter(d => 
      d.mapId === mapId && 
      d.status === 'Published' && 
      d.visibility === 'public'
    );
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
    getPublishedClientMapDrawings
  };
})();
