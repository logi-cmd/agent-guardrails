import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { getServeHostWarning, readBody } from "../lib/commands/serve.js";

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

export async function run() {
  await readBodyRejectsOversizedPayloads();
  await readBodyStillParsesValidJsonWithinLimit();
  await getServeHostWarningWarnsForRemoteHostsOnly();
}
