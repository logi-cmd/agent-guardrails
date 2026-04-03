import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { runInit } from "../lib/commands/init.js";
import { runPlan } from "../lib/commands/plan.js";
import { startMcpServer, LOOP_ORIENTED_TOOLS, DEFAULT_SESSION_CALL_LIMIT } from "../lib/mcp/server.js";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
function encodeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.from(`Content-Length: ${payload.length}\r\n\r\n${payload.toString("utf8")}`, "utf8");
}

function createClient(outputStream, inputStream) {
  let nextId = 1;
  let buffer = Buffer.alloc(0);
  const pending = new Map();

  outputStream.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        break;
      }

      const headerText = buffer.slice(0, headerEnd).toString("utf8");
      const contentLengthLine = headerText
        .split("\r\n")
        .find((line) => /^Content-Length:/i.test(line));

      if (!contentLengthLine) {
        throw new Error("Missing Content-Length header in MCP response.");
      }

      const contentLength = Number(contentLengthLine.split(":")[1]?.trim() ?? "");
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;
      if (buffer.length < messageEnd) {
        break;
      }

      const payload = buffer.slice(messageStart, messageEnd).toString("utf8");
      buffer = buffer.slice(messageEnd);
      const message = JSON.parse(payload);
      const resolver = pending.get(message.id);
      if (resolver) {
        pending.delete(message.id);
        resolver(message);
      }
    }
  });

  return {
    request(method, params = {}) {
      const id = nextId++;
      const payload = { jsonrpc: "2.0", id, method, params };
      inputStream.write(encodeMessage(payload));
      return new Promise((resolve) => {
        pending.set(id, resolve);
      });
    },
    notify(method, params = {}) {
      const payload = { jsonrpc: "2.0", method, params };
      inputStream.write(encodeMessage(payload));
    }
  };
}

async function withRepoCwd(tempDir, callback) {
  const original = process.cwd();
  process.chdir(tempDir);
  try {
    return await callback();
  } finally {
    process.chdir(original);
  }
}

async function initRepo(tempDir) {
  await runInit({
    positional: [tempDir],
    flags: { preset: "node-service", lang: "en" },
    locale: "en"
  });
}

export async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-mcp-"));
  await initRepo(tempDir);

  fs.mkdirSync(path.join(tempDir, "src", "orders"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "orders", "refund-service.js"), "export const refund = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "refund-service.test.js"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Task: Refine refund flow\n- Commands run: npm test\n- Residual risk: none\n",
    "utf8"
  );

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Refine refund flow",
        "allow-paths": "src/,tests/",
        "intended-files": "src/orders/refund-service.js,tests/refund-service.test.js",
        "required-commands": "npm test",
        evidence: ".agent-guardrails/evidence/current-task.md",
        lang: "en"
      },
      locale: "en"
    })
  );

  const input = new PassThrough();
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  const stderr = [];
  errorOutput.on("data", (chunk) => {
    stderr.push(chunk.toString("utf8"));
  });

  const originalChangedFiles = process.env.AGENT_GUARDRAILS_CHANGED_FILES;
  process.env.AGENT_GUARDRAILS_CHANGED_FILES = ["src/orders/refund-service.js", "tests/refund-service.test.js"].join(path.delimiter);
  const serverPromise = startMcpServer({
    input,
    output,
    errorOutput,
    repoRoot: tempDir
  });

  const client = createClient(output, input);

  try {
    const initResponse = await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" }
    });
    assert.equal(initResponse.result.serverInfo.name, "agent-guardrails-mcp");

    client.notify("notifications/initialized");

    const toolsResponse = await client.request("tools/list");
    const toolNames = toolsResponse.result.tools.map((tool) => tool.name);
    assert.deepEqual(toolNames, [
      "read_repo_guardrails",
      "suggest_task_contract",
      "start_agent_native_loop",
      "check_after_edit",
      "finish_agent_native_loop",
      "run_guardrail_check",
      "summarize_review_risks",
      "plan_rough_intent",
      "read_daemon_status",
      "explain_change",
      "query_archaeology"
    ]);

    const guardrailsResponse = await client.request("tools/call", {
      name: "read_repo_guardrails",
      arguments: { repoRoot: tempDir }
    });
    assert.equal(guardrailsResponse.result.structuredContent.preset, "node-service");

    const suggestResponse = await client.request("tools/call", {
      name: "suggest_task_contract",
      arguments: {
        repoRoot: tempDir,
        taskRequest: "I only have a rough idea. Please find the smallest safe change.",
        selectedFiles: ["src/orders/refund-service.js"],
        changedFiles: ["src/orders/refund-service.js", "tests/refund-service.test.js"]
      }
    });
    assert.equal(suggestResponse.result.structuredContent.contract.task, "I only have a rough idea. Please find the smallest safe change.");
    assert.equal(typeof suggestResponse.result.structuredContent.session.sessionId, "string");
    assert.equal(suggestResponse.result.structuredContent.session.roughIntent.detected, true);
    assert.equal(suggestResponse.result.structuredContent.suggestions.roughIntent.detected, true);
    assert.equal(suggestResponse.result.structuredContent.suggestions.roughIntent.suggestions.length, 3);

    const startLoopResponse = await client.request("tools/call", {
      name: "start_agent_native_loop",
      arguments: {
        repoRoot: tempDir,
        taskRequest: "I only have a rough idea. Please find the smallest safe change.",
        selectedFiles: ["src/orders/refund-service.js"],
        changedFiles: ["src/orders/refund-service.js", "tests/refund-service.test.js"]
      }
    });
    assert.equal(startLoopResponse.result.structuredContent.contract.task, "I only have a rough idea. Please find the smallest safe change.");
    assert.equal(startLoopResponse.result.structuredContent.evidenceFiles[0].path, ".agent-guardrails/evidence/current-task.md");
    assert.equal(Array.isArray(startLoopResponse.result.structuredContent.continuity.reuseTargets), true);
    assert.equal(startLoopResponse.result.structuredContent.session.roughIntent.detected, true);
    assert.match(startLoopResponse.result.structuredContent.finishCheck.recommendedCommand, /agent-guardrails check --review/);

    const finishLoopResponse = await client.request("tools/call", {
      name: "finish_agent_native_loop",
      arguments: {
        repoRoot: tempDir,
        commandsRun: ["npm test"],
        evidence: {
          notableResults: ["Refund tests passed after refining the flow."],
          reviewNotes: ["Stayed inside the declared refund service and test files."],
          residualRisk: "none"
        }
      }
    });
    assert.equal(finishLoopResponse.result.structuredContent.checkResult.ok, true);
    assert.equal(finishLoopResponse.result.structuredContent.reviewerSummary.status, "pass");
    assert.equal(finishLoopResponse.result.structuredContent.reviewerSummary.verdict, "Safe to review");
    assert.equal(Array.isArray(finishLoopResponse.result.structuredContent.reviewerSummary.futureMaintenanceRisks), true);
    assert.equal(typeof finishLoopResponse.result.structuredContent.reviewerSummary.costHints, "object");
    assert.equal(Array.isArray(finishLoopResponse.result.structuredContent.reviewerSummary.costHints.entries), true);

    const checkAfterEditResponse = await client.request("tools/call", {
      name: "check_after_edit",
      arguments: { repoRoot: tempDir }
    });
    assert.equal(typeof checkAfterEditResponse.result.structuredContent.status, "string");
    assert.equal(checkAfterEditResponse.result.content[0].type, "text");
    assert.equal(Array.isArray(checkAfterEditResponse.result.structuredContent.newFindings), true);

    const checkResponse = await client.request("tools/call", {
      name: "run_guardrail_check",
      arguments: {
        repoRoot: tempDir,
        commandsRun: ["npm test"],
        review: true
      }
    });
    assert.equal(checkResponse.result.structuredContent.ok, true);
    assert.equal(checkResponse.result.structuredContent.verdict, "Safe to review");
    assert.equal(typeof checkResponse.result.structuredContent.continuity, "object");
    assert.match(checkResponse.result.structuredContent.finishCheck.recommendedCommand, /agent-guardrails check --review/);

    const summaryResponse = await client.request("tools/call", {
      name: "summarize_review_risks",
      arguments: {
        checkResult: checkResponse.result.structuredContent
      }
    });
    assert.equal(summaryResponse.result.structuredContent.status, "pass");
    assert.equal(summaryResponse.result.structuredContent.verdict, "Safe to review");
    assert.equal(Array.isArray(summaryResponse.result.structuredContent.nextActions), true);
    assert.equal(typeof summaryResponse.result.structuredContent.costHints, "object");
    assert.equal(typeof summaryResponse.result.structuredContent.costHints.sizeLevel, "string");
    assert.equal(Array.isArray(summaryResponse.result.structuredContent.costHints.entries), true);

    const daemonStatusResponse = await client.request("tools/call", {
      name: "read_daemon_status",
      arguments: { repoRoot: tempDir }
    });
    const daemonData = daemonStatusResponse.result.structuredContent;
    assert.equal(typeof daemonData.running, "boolean");
    assert.equal(typeof daemonData.checksRun, "number");
    assert.equal(typeof daemonData.config, "object");
    assert.equal(Array.isArray(daemonData.config.watchPaths), true);
  } finally {
    input.end();
    await serverPromise;
    if (originalChangedFiles == null) {
      delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    } else {
      process.env.AGENT_GUARDRAILS_CHANGED_FILES = originalChangedFiles;
    }
  }

  assert.equal(stderr.join("").trim(), "");

  const limitInput = new PassThrough();
  const limitOutput = new PassThrough();
  const limitErrorOutput = new PassThrough();
  const limitServerPromise = startMcpServer({
    input: limitInput,
    output: limitOutput,
    errorOutput: limitErrorOutput,
    repoRoot: tempDir,
    sessionCallLimit: 3
  });
  const limitClient = createClient(limitOutput, limitInput);

  try {
    await limitClient.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-limit-client", version: "1.0.0" }
    });
    limitClient.notify("notifications/initialized");

    const call1 = await limitClient.request("tools/call", {
      name: "check_after_edit",
      arguments: { repoRoot: tempDir }
    });
    assert.ok(call1.result, "call 1 should succeed");
    assert.ok(call1.result.structuredContent, "call 1 should have structuredContent");

    const call2 = await limitClient.request("tools/call", {
      name: "check_after_edit",
      arguments: { repoRoot: tempDir }
    });
    assert.ok(call2.result, "call 2 should succeed");

    const call3 = await limitClient.request("tools/call", {
      name: "check_after_edit",
      arguments: { repoRoot: tempDir }
    });
    assert.ok(call3.result, "call 3 should succeed (at limit)");

    const call4 = await limitClient.request("tools/call", {
      name: "check_after_edit",
      arguments: { repoRoot: tempDir }
    });
    assert.ok(call4.error, "call 4 should be rejected");
    assert.equal(call4.error.code, -32020, "error code should be session call limit");
    assert.equal(call4.error.data.limit, 3, "data.limit should be 3");
    assert.equal(call4.error.data.current, 4, "data.current should be 4");
    assert.equal(call4.error.data.tool, "check_after_edit");
    assert.match(call4.error.message, /Session call limit exceeded/);

    const guardResp = await limitClient.request("tools/call", {
      name: "read_repo_guardrails",
      arguments: { repoRoot: tempDir }
    });
    assert.ok(guardResp.result, "non-loop tools should still work after limit");
    assert.equal(guardResp.result.structuredContent.preset, "node-service");

    const otherBlocked = await limitClient.request("tools/call", {
      name: "run_guardrail_check",
      arguments: { repoRoot: tempDir }
    });
    assert.ok(otherBlocked.error, "different loop tool should also be blocked");
    assert.equal(otherBlocked.error.code, -32020);
    assert.equal(otherBlocked.error.data.tool, "run_guardrail_check");
  } finally {
    limitInput.end();
    await limitServerPromise;
  }

  assert.ok(LOOP_ORIENTED_TOOLS.has("check_after_edit"));
  assert.ok(LOOP_ORIENTED_TOOLS.has("start_agent_native_loop"));
  assert.ok(LOOP_ORIENTED_TOOLS.has("finish_agent_native_loop"));
  assert.ok(LOOP_ORIENTED_TOOLS.has("run_guardrail_check"));
  assert.ok(LOOP_ORIENTED_TOOLS.has("summarize_review_risks"));
  assert.ok(LOOP_ORIENTED_TOOLS.has("explain_change"));
  assert.ok(LOOP_ORIENTED_TOOLS.has("query_archaeology"));
  assert.ok(!LOOP_ORIENTED_TOOLS.has("read_repo_guardrails"));
  assert.ok(!LOOP_ORIENTED_TOOLS.has("suggest_task_contract"));
  assert.ok(!LOOP_ORIENTED_TOOLS.has("plan_rough_intent"));
  assert.ok(!LOOP_ORIENTED_TOOLS.has("read_daemon_status"));
  assert.equal(DEFAULT_SESSION_CALL_LIMIT, 50);
}
