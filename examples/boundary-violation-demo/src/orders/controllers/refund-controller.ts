import { loadRefundSummary } from "../services/refund-service";

function buildRefundResponse() {
  return loadRefundSummary();
}

buildRefundResponse();
