// Dealer Command Center calculations. Pure helpers; UI can consume later.
(function() {
  const ACTIVE_CLIENT_STATUSES = ['New', 'Interested', 'Warm', 'Property Shared', 'Site Visit Planned', 'Site Visit Done', 'Negotiation'];
  const HOT_CLIENT_STATUSES = ['Warm', 'Property Shared', 'Site Visit Planned', 'Negotiation'];

  function daysAgo(value) {
    const time = new Date(value || Date.now()).getTime();
    return Math.max(0, Math.floor((Date.now() - time) / 86400000));
  }

  function eventsOf(data, type) {
    return (data.events || []).concat(data.presentationEvents || []).filter(event => (event.type || event.eventType) === type);
  }

  function computeBusinessPulse(data) {
    const clients = data.clients || [];
    const activeClients = clients.filter(client => ACTIVE_CLIENT_STATUSES.includes(client.status));
    const hotClients = clients.filter(client => HOT_CLIENT_STATUSES.includes(client.status));
    const missedFollowups = (data.followups || []).filter(item => ['missed', 'Missed'].includes(item.status));
    const topArea = computeAreaMovement(data)[0];
    return {
      activeClients: activeClients.length,
      hotClients: hotClients.length,
      missedFollowups: missedFollowups.length,
      topArea: topArea ? topArea.name : '',
      summary: `${topArea ? topArea.name : 'No area'} has the strongest current movement. ${hotClients.length} clients need priority attention.`
    };
  }

  function computeCallFirstClients(data) {
    return (data.clients || [])
      .filter(client => HOT_CLIENT_STATUSES.includes(client.status) || daysAgo(client.lastActivityAt || client.updatedAt) >= 3)
      .map(client => ({
        id: client.id,
        name: client.name,
        phone: client.phone,
        status: client.status,
        interestedArea: client.interestedArea || client.area || '',
        reason: client.status === 'Negotiation' ? 'Closing stage' : daysAgo(client.lastActivityAt || client.updatedAt) >= 3 ? 'Needs follow-up' : 'Warm lead'
      }))
      .slice(0, 8);
  }

  function computeSilentClients(data) {
    return (data.clients || [])
      .filter(client => !['Closed', 'Lost'].includes(client.status) && daysAgo(client.lastActivityAt || client.updatedAt) >= 7)
      .map(client => Object.assign({}, client, { silentDays: daysAgo(client.lastActivityAt || client.updatedAt) }));
  }

  function computeBusinessLeaks(data) {
    const leaks = [];
    (data.followups || []).filter(item => ['missed', 'Missed'].includes(item.status)).forEach(item => {
      leaks.push({ type: 'missed_followup', clientId: item.clientId, assignedStaff: item.assignedStaff || item.assignedStaffId, priority: 'high' });
    });
    computeSilentClients(data).forEach(client => {
      leaks.push({ type: 'silent_client', clientId: client.id, assignedStaff: client.assignedStaff, priority: client.silentDays > 14 ? 'high' : 'medium' });
    });
    return leaks;
  }

  function computeAreaMovement(data) {
    const areas = {};
    (data.areas || []).forEach(area => { areas[area] = { name: area, clientInterest: 0, views: 0, shares: 0, visits: 0, deals: 0, score: 0 }; });
    (data.clients || []).forEach(client => {
      const area = client.interestedArea || client.area;
      if (!areas[area]) areas[area] = { name: area, clientInterest: 0, views: 0, shares: 0, visits: 0, deals: 0, score: 0 };
      areas[area].clientInterest += 1;
    });
    (data.events || []).concat(data.presentationEvents || []).forEach(event => {
      const area = event.area;
      if (!area) return;
      if (!areas[area]) areas[area] = { name: area, clientInterest: 0, views: 0, shares: 0, visits: 0, deals: 0, score: 0 };
      const type = event.type || event.eventType;
      if (/viewed|selected|opened/.test(type)) areas[area].views += 1;
      if (/shared/.test(type)) areas[area].shares += 1;
    });
    (data.siteVisits || []).forEach(visit => { if (areas[visit.area]) areas[visit.area].visits += 1; });
    (data.deals || []).forEach(deal => { if (areas[deal.area]) areas[deal.area].deals += 1; });
    return Object.values(areas).map(area => Object.assign(area, {
      score: area.clientInterest * 3 + area.views + area.shares * 2 + area.visits * 3 + area.deals * 5
    })).sort((a, b) => b.score - a.score);
  }

  function getPropertyReadiness(property) {
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
      needsReview: !readyToPresent,
      missing: [
        photosMissing ? 'photos' : '',
        mapPinMissing ? 'map pin' : '',
        sectorProofMissing ? 'sector proof' : ''
      ].filter(Boolean)
    };
  }

  function computeInventorySignals(data) {
    const readiness = (data.properties || []).map(getPropertyReadiness);
    return {
      total: readiness.length,
      readyToPresent: readiness.filter(item => item.readyToPresent).length,
      needsReview: readiness.filter(item => item.needsReview).length,
      photosMissing: readiness.filter(item => item.photosMissing).length,
      mapPinMissing: readiness.filter(item => item.mapPinMissing).length,
      sectorProofMissing: readiness.filter(item => item.sectorProofMissing).length,
      readiness
    };
  }

  function computeClientMovement(data) {
    const grouped = {};
    (data.clients || []).forEach(client => {
      grouped[client.status || 'Unknown'] = (grouped[client.status || 'Unknown'] || 0) + 1;
    });
    return grouped;
  }

  function computeTeamMovement(data) {
    const users = (data.users && data.users.length ? data.users : data.staff) || [];
    return users.map(user => {
      const userId = user.id;
      return {
        id: userId,
        name: user.name,
        clients: (data.clients || []).filter(client => client.assignedStaff === userId || client.assignedStaffId === userId).length,
        followups: (data.followups || []).filter(item => item.assignedStaff === userId || item.assignedStaffId === userId).length,
        visits: (data.siteVisits || []).filter(item => item.assignedStaff === userId || item.assignedStaffId === userId).length,
        deals: (data.deals || []).filter(item => item.staffId === userId).length
      };
    });
  }

  function computeMoneyPendingShortcut(data) {
    const summary = window.PMFinanceEngine ? window.PMFinanceEngine.computeFinanceSummary(data) : { commissionPending: 0, recoveryQueue: [] };
    return {
      pending: summary.commissionPending || 0,
      count: (summary.recoveryQueue || []).length,
      top: (summary.recoveryQueue || [])[0] || null
    };
  }

  function computeMapActivity(data) {
    return {
      opened: eventsOf(data, 'map_opened').length + eventsOf(data, 'presentation_opened').length,
      propertiesSelected: eventsOf(data, 'property_selected').length + eventsOf(data, 'property_viewed').length,
      shares: eventsOf(data, 'property_shared').length + eventsOf(data, 'property_shared_whatsapp').length
    };
  }

  function computeDealerCommandInsights(data) {
    return {
      businessPulse: computeBusinessPulse(data),
      callFirst: computeCallFirstClients(data),
      silentClients: computeSilentClients(data),
      businessLeaks: computeBusinessLeaks(data),
      areaMovement: computeAreaMovement(data),
      inventorySignals: computeInventorySignals(data),
      clientMovement: computeClientMovement(data),
      mapActivity: computeMapActivity(data),
      teamMovement: computeTeamMovement(data),
      moneyPending: computeMoneyPendingShortcut(data)
    };
  }

  window.PMCommandEngine = {
    computeBusinessPulse,
    computeCallFirstClients,
    computeSilentClients,
    computeBusinessLeaks,
    computeAreaMovement,
    getPropertyReadiness,
    computeInventorySignals,
    computeClientMovement,
    computeMapActivity,
    computeTeamMovement,
    computeMoneyPendingShortcut,
    computeDealerCommandInsights
  };
})();
