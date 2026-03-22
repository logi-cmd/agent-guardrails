function buildRefundPayload() {
  return { ok: true, visibility: "internal" };
}

function refundOrder() {
  return buildRefundPayload();
}
