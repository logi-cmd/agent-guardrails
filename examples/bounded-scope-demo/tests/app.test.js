import assert from "node:assert/strict";
import { buildAuditSummary } from "../src/app.js";

// Test basic functionality
const summary = buildAuditSummary([
  { type: "created" },
  { type: "created" },
  { type: "approved" }
]);

assert.equal(summary.total, 3);
assert.equal(summary.byType.created, 2);
assert.equal(summary.byType.approved, 1);
assert.deepEqual(summary.bySeverity, {});

// Test severity filter
const eventsWithSeverity = [
  { type: "created", severity: "high" },
  { type: "created", severity: "low" },
  { type: "approved", severity: "high" }
];

const highSeveritySummary = buildAuditSummary(eventsWithSeverity, { severityFilter: "high" });
assert.equal(highSeveritySummary.total, 2);
assert.equal(highSeveritySummary.byType.created, 1);
assert.equal(highSeveritySummary.byType.approved, 1);
assert.equal(highSeveritySummary.bySeverity.high, 2);

const lowSeveritySummary = buildAuditSummary(eventsWithSeverity, { severityFilter: "low" });
assert.equal(lowSeveritySummary.total, 1);
assert.equal(lowSeveritySummary.byType.created, 1);
assert.equal(lowSeveritySummary.byType.approved, undefined);
assert.equal(lowSeveritySummary.bySeverity.low, 1);

// Test bySeverity with no filter
const fullSummary = buildAuditSummary(eventsWithSeverity);
assert.equal(fullSummary.total, 3);
assert.equal(fullSummary.bySeverity.high, 2);
assert.equal(fullSummary.bySeverity.low, 1);

const emptySummary = buildAuditSummary();
assert.equal(emptySummary.total, 0);
assert.deepEqual(emptySummary.byType, {});
assert.deepEqual(emptySummary.bySeverity, {});
