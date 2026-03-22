import assert from "node:assert/strict";
import { buildAuditSummary } from "../src/app.js";

const summary = buildAuditSummary([
  { type: "created" },
  { type: "created" },
  { type: "approved" }
]);

assert.equal(summary.total, 3);
assert.equal(summary.byType.created, 2);
assert.equal(summary.byType.approved, 1);
