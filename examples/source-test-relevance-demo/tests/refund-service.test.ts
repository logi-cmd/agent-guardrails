import { strict as assert } from "node:assert";

function refundOrder() {
  return { ok: true };
}

assert.equal(refundOrder().ok, true);
