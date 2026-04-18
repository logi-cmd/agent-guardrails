import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { bodyReadErrorResponse, formatToolFailure, getServeHostWarning, readBody } from "../lib/commands/serve.js";

function requestFromChunks(chunks) {
  const req = new EventEmitter();
  process.nextTick(() => {
    for (const chunk of chunks) {
      req.emit("data", Buffer.from(chunk));
    }
    req.emit("end");
  });
  return req;
}

async function readBodyRejectsOversizedPayloads() {
  const req = requestFromChunks(['{"message":"too-large"}']);

  await assert.rejects(
    () => readBody(req, { maxBytes: 8 }),
    /Request body too large/
  );
}

async function readBodyStillParsesValidJsonWithinLimit() {
  const req = requestFromChunks(['{"message":"ok"}']);

  const body = await readBody(req, { maxBytes: 64 });

  assert.equal(body.message, "ok");
}

async function getServeHostWarningWarnsForRemoteHostsOnly() {
  assert.equal(getServeHostWarning("127.0.0.1"), null);
  assert.equal(getServeHostWarning("localhost"), null);
  assert.match(getServeHostWarning("0.0.0.0"), /network interfaces/i);
}

function bodyReadErrorResponseDistinguishesTooLargePayloads() {
  assert.deepEqual(bodyReadErrorResponse(new Error("Request body too large")), {
    status: 413,
    body: { error: "Request body too large" }
  });

  assert.deepEqual(bodyReadErrorResponse(new Error("Invalid JSON body")), {
    status: 400,
    body: { error: "Invalid JSON" }
  });
}

function formatToolFailureUsesCleanAsciiText() {
  const message = formatToolFailure("check", new Error("boom"));

  assert.equal(message, "Tool check failed: boom");
  assert.doesNotMatch(message, /鉂|璋|澶|辫|触|�/);
}

export async function run() {
  await readBodyRejectsOversizedPayloads();
  await readBodyStillParsesValidJsonWithinLimit();
  await getServeHostWarningWarnsForRemoteHostsOnly();
  bodyReadErrorResponseDistinguishesTooLargePayloads();
  formatToolFailureUsesCleanAsciiText();
}
