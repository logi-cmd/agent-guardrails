export function buildAuditSummary(events, { severityFilter = null } = {}) {
  const sourceEvents = Array.isArray(events) ? events : [];
  let filtered = sourceEvents;
  if (severityFilter) {
    filtered = sourceEvents.filter(e => e.severity === severityFilter);
  }

  const total = filtered.length;
  const byType = filtered.reduce((counts, event) => {
    counts[event.type] = (counts[event.type] || 0) + 1;
    return counts;
  }, {});

  const bySeverity = filtered.reduce((counts, event) => {
    if (event.severity) {
      counts[event.severity] = (counts[event.severity] || 0) + 1;
    }
    return counts;
  }, {});

  return {
    total,
    byType,
    bySeverity
  };
}
