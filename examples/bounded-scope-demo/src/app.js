export function buildAuditSummary(events) {
  const total = events.length;
  const byType = events.reduce((counts, event) => {
    counts[event.type] = (counts[event.type] || 0) + 1;
    return counts;
  }, {});

  return {
    total,
    byType
  };
}
