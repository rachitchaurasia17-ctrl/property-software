// Deterministic owner report generator. AI can replace the text layer later.
(function() {
  function getData() {
    if (window.PMDataAdapter) return window.PMDataAdapter.getData();
    if (window.CRM && window.CRM.getCRM) return window.CRM.getCRM();
    return {};
  }

  function saveData(data) {
    if (window.PMDataAdapter) return window.PMDataAdapter.saveData(data);
    if (window.CRM && window.CRM.saveCRM) return window.CRM.saveCRM(data);
    return false;
  }

  function money(amount) {
    return window.PMFinanceEngine ? window.PMFinanceEngine.formatIndianMoney(amount) : String(amount || 0);
  }

  function generateDailyOwnerReport(dealerId, date) {
    const data = getData();
    const reportDate = date || new Date().toISOString().slice(0, 10);
    const insights = window.PMCommandEngine ? window.PMCommandEngine.computeDealerCommandInsights(data) : {};
    const finance = window.PMFinanceEngine ? window.PMFinanceEngine.computeFinanceSummary(data) : { commissionPending: 0 };
    const topArea = insights.areaMovement && insights.areaMovement[0] ? insights.areaMovement[0].name : 'No area';
    const priorityClients = insights.callFirst || [];
    const silentClients = insights.silentClients || [];
    const leaks = insights.businessLeaks || [];
    const inventory = insights.inventorySignals || { readyToPresent: 0, needsReview: 0 };
    const team = insights.teamMovement || [];
    const aiText = [
      `Today ${topArea} received the strongest activity.`,
      `${priorityClients.length} clients should be called first.`,
      `${leaks.length} possible business leaks need review.`,
      `${money(finance.commissionPending || 0)} is pending from recorded deals.`,
      `Tomorrow, focus on priority clients and inventory items needing proof.`
    ].join(' ');
    const sections = {
      businessPulse: insights.businessPulse || {},
      priorityClients,
      silentClients,
      missedOpportunities: leaks,
      areaPulse: insights.areaMovement || [],
      inventorySignals: inventory,
      teamActivity: team,
      moneyPending: insights.moneyPending || {},
      suggestedActions: [
        'Call priority clients first.',
        'Review missed follow-ups.',
        'Update inventory proof fields.',
        'Follow up on pending commission.'
      ]
    };
    const report = {
      id: window.PMDataAdapter ? window.PMDataAdapter.generateId('rep') : `rep-${Math.random().toString(36).slice(2, 11)}`,
      dealerId: dealerId || (data.dealers && data.dealers[0] && data.dealers[0].id) || null,
      reportType: 'daily',
      reportDate,
      summary: aiText,
      metricsJson: sections,
      aiText,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (!Array.isArray(data.reports)) data.reports = [];
    data.reports = data.reports.filter(item => !(item.dealerId === report.dealerId && item.reportType === 'daily' && item.reportDate === report.reportDate));
    data.reports.push(report);
    saveData(data);
    if (window.PMSyncQueue) {
      window.PMSyncQueue.enqueueSyncAction({
        dealerId: report.dealerId,
        entityType: 'reports',
        entityId: report.id,
        actionType: 'generate',
        payload: report
      });
    }
    return report;
  }

  window.PMReportEngine = {
    generateDailyOwnerReport
  };
})();
