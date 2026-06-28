// Finance calculations for owner/admin surfaces only.
(function() {
  function n(value) {
    return Number(value) || 0;
  }

  function dealCommissionExpected(deal) {
    return n(deal.commissionExpected || deal.commissionAmount);
  }

  function formatIndianMoney(amount) {
    const value = Math.round(n(amount));
    if (value >= 10000000) return `Rs ${(value / 10000000).toFixed(value % 10000000 ? 1 : 0)} Cr`;
    if (value >= 100000) return `Rs ${(value / 100000).toFixed(value % 100000 ? 1 : 0)} L`;
    return `Rs ${value.toLocaleString('en-IN')}`;
  }

  function computeTotalDealValue(deals) {
    return (deals || []).reduce((sum, deal) => sum + n(deal.dealValue), 0);
  }

  function computeCommissionEarned(deals) {
    return (deals || []).reduce((sum, deal) => sum + dealCommissionExpected(deal), 0);
  }

  function computeCommissionReceived(deals) {
    return (deals || []).reduce((sum, deal) => sum + n(deal.commissionReceived), 0);
  }

  function computeCommissionPending(deals) {
    return (deals || []).reduce((sum, deal) => sum + n(deal.commissionPending || (dealCommissionExpected(deal) - n(deal.commissionReceived))), 0);
  }

  function computePendingMoneyRecovery(deals) {
    return (deals || []).filter(deal => n(deal.commissionPending || (dealCommissionExpected(deal) - n(deal.commissionReceived))) > 0);
  }

  function computeRecentDeals(deals) {
    return (deals || []).slice().sort((a, b) => new Date(b.closedAt || b.dealDate || b.createdAt || 0) - new Date(a.closedAt || a.dealDate || a.createdAt || 0)).slice(0, 10);
  }

  function groupByRevenue(deals, keyFn) {
    const grouped = {};
    (deals || []).forEach(deal => {
      const key = keyFn(deal) || 'Unknown';
      if (!grouped[key]) grouped[key] = { name: key, deals: 0, dealValue: 0, earned: 0, received: 0, pending: 0 };
      grouped[key].deals += 1;
      grouped[key].dealValue += n(deal.dealValue);
      grouped[key].earned += dealCommissionExpected(deal);
      grouped[key].received += n(deal.commissionReceived);
      grouped[key].pending += n(deal.commissionPending || (dealCommissionExpected(deal) - n(deal.commissionReceived)));
    });
    return Object.values(grouped).sort((a, b) => b.earned - a.earned);
  }

  function computeClientRevenue(deals, clients) {
    return groupByRevenue(deals, deal => {
      const client = (clients || []).find(item => item.id === deal.clientId);
      return client ? client.name : deal.clientId;
    });
  }

  function computeHighValueClients(deals, clients) {
    return computeClientRevenue(deals, clients).filter(item => item.earned > 0).slice(0, 5);
  }

  function computeAreaWiseRevenue(deals) {
    return groupByRevenue(deals, deal => deal.area);
  }

  function computeStaffWiseRevenue(deals, users) {
    return groupByRevenue(deals, deal => {
      const user = (users || []).find(item => item.id === deal.staffId || item.id === deal.assignedStaff);
      return user ? user.name : deal.staffId;
    });
  }

  function computePropertyTypeRevenue(deals) {
    return groupByRevenue(deals, deal => deal.propertyType || deal.dealType);
  }

  function computeAverageCommissionPerDeal(deals) {
    return (deals || []).length ? computeCommissionEarned(deals) / deals.length : 0;
  }

  function computeMoneyRecoveryQueue(data) {
    return computePendingMoneyRecovery(data.deals).map(deal => ({
      dealId: deal.id,
      clientId: deal.clientId,
      amount: n(deal.commissionPending || (dealCommissionExpected(deal) - n(deal.commissionReceived))),
      area: deal.area,
      staffId: deal.staffId,
      priority: n(deal.commissionPending) > 250000 ? 'high' : 'normal'
    }));
  }

  function computeDeadMoneyAlerts(data) {
    const cutoff = Date.now() - 30 * 86400000;
    return computePendingMoneyRecovery(data.deals).filter(deal => new Date(deal.closedAt || deal.dealDate || deal.createdAt || 0).getTime() < cutoff);
  }

  function computePendingCommissionAging(data) {
    return computePendingMoneyRecovery(data.deals).map(deal => ({
      dealId: deal.id,
      days: Math.max(0, Math.floor((Date.now() - new Date(deal.closedAt || deal.dealDate || deal.createdAt || Date.now()).getTime()) / 86400000)),
      pending: n(deal.commissionPending || (dealCommissionExpected(deal) - n(deal.commissionReceived)))
    }));
  }

  function computeDealQualityScores(data) {
    return (data.deals || []).map(deal => ({
      dealId: deal.id,
      score: Math.min(100, 50 + (deal.area ? 10 : 0) + (deal.propertyType ? 10 : 0) + (n(deal.commissionReceived) > 0 ? 20 : 0) + (deal.clientId ? 10 : 0))
    }));
  }

  function computeExpectedCashInTimeline(data) {
    return computePendingMoneyRecovery(data.deals).map(deal => ({
      dealId: deal.id,
      expectedAt: deal.expectedCommissionAt || deal.closedAt || deal.dealDate || null,
      pending: n(deal.commissionPending || (dealCommissionExpected(deal) - n(deal.commissionReceived)))
    }));
  }

  function computeMoneyLeaks(data) {
    return computeDeadMoneyAlerts(data).map(deal => ({
      dealId: deal.id,
      reason: 'Pending commission has aged beyond 30 days',
      amount: n(deal.commissionPending || (dealCommissionExpected(deal) - n(deal.commissionReceived)))
    }));
  }

  function computeFinanceSummary(data) {
    const deals = data.deals || [];
    return {
      dealsClosed: deals.length,
      totalDealValue: computeTotalDealValue(deals),
      commissionEarned: computeCommissionEarned(deals),
      commissionReceived: computeCommissionReceived(deals),
      commissionPending: computeCommissionPending(deals),
      averageCommissionPerDeal: computeAverageCommissionPerDeal(deals),
      recentDeals: computeRecentDeals(deals),
      clientRevenue: computeClientRevenue(deals, data.clients || []),
      highValueClients: computeHighValueClients(deals, data.clients || []),
      areaRevenue: computeAreaWiseRevenue(deals),
      staffRevenue: computeStaffWiseRevenue(deals, data.users || data.staff || []),
      propertyTypeRevenue: computePropertyTypeRevenue(deals),
      recoveryQueue: computeMoneyRecoveryQueue(data),
      deadMoneyAlerts: computeDeadMoneyAlerts(data),
      pendingCommissionAging: computePendingCommissionAging(data),
      dealQualityScores: computeDealQualityScores(data),
      expectedCashInTimeline: computeExpectedCashInTimeline(data),
      moneyLeaks: computeMoneyLeaks(data)
    };
  }

  window.PMFinanceEngine = {
    formatIndianMoney,
    computeTotalDealValue,
    computeCommissionEarned,
    computeCommissionReceived,
    computeCommissionPending,
    computePendingMoneyRecovery,
    computeRecentDeals,
    computeClientRevenue,
    computeHighValueClients,
    computeAreaWiseRevenue,
    computeStaffWiseRevenue,
    computePropertyTypeRevenue,
    computeAverageCommissionPerDeal,
    computeMoneyRecoveryQueue,
    computeDeadMoneyAlerts,
    computePendingCommissionAging,
    computeDealQualityScores,
    computeExpectedCashInTimeline,
    computeMoneyLeaks,
    computeFinanceSummary
  };
})();
