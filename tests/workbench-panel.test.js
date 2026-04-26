import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runWorkbenchPanel } from "../lib/commands/workbench-panel.js";

function withTempDir(callback) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-workbench-panel-"));
  try {
    return callback(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function captureStdout(callback) {
  const lines = [];
  const originalLog = console.log;
  console.log = (...args) => {
    lines.push(args.join(" "));
  };
  try {
    await callback();
  } finally {
    console.log = originalLog;
  }
  return lines.join("\n");
}

function writePanel(root, panel) {
  const filePath = path.join(root, "operator-workbench-panel.json");
  fs.writeFileSync(filePath, `${JSON.stringify(panel, null, 2)}\n`, "utf8");
  return filePath;
}

function samplePanel() {
  return {
    format: "agent-guardrails-workbench-panel.v1",
    hero: {
      question: "Can I ship this change?",
      answer: "No",
      state: "blocked",
      riskLabel: "High risk",
      trustScore: 41,
      reason: "Visible checkout proof is missing."
    },
    statusStrip: [
      { label: "Scope", value: "clean" },
      { label: "Tests", value: "missing" }
    ],
    nextStep: {
      label: "Run visible checkout proof",
      command: "npm run test:checkout:visible",
      rerunCommand: "agent-guardrails pro workbench --native-panel",
      evidenceTool: "visible check"
    },
    handoff: {
      label: "Copy Codex handoff",
      humanRole: "Watch the checkout flow and save the screenshot path.",
      stopConditions: ["Stop if sandbox credentials are unavailable."]
    },
    sections: [
      {
        title: "Next proof",
        status: "needs_work",
        summary: "Run the visible checkout proof."
      }
    ]
  };
}

test("workbench-panel renders a readable panel from JSON", async () => {
  await withTempDir(async (tempDir) => {
    const filePath = writePanel(tempDir, samplePanel());
    const output = await captureStdout(() =>
      runWorkbenchPanel({ flags: { file: filePath } })
    );

    assert.match(output, /Agent Guardrails Workbench \| BLOCKED \| High risk/);
    assert.match(output, /Can I ship this change\? -> No/);
    assert.match(output, /\$ npm run test:checkout:visible/);
    assert.match(output, /Then rerun: agent-guardrails pro workbench --native-panel/);
  });
});

test("workbench-panel --json prints the panel contract", async () => {
  await withTempDir(async (tempDir) => {
    const filePath = writePanel(tempDir, samplePanel());
    const output = await captureStdout(() =>
      runWorkbenchPanel({ flags: { file: filePath, json: true } })
    );

    const parsed = JSON.parse(output);
    assert.equal(parsed.format, "agent-guardrails-workbench-panel.v1");
    assert.equal(parsed.hero.state, "blocked");
  });
});

test("workbench-panel rejects unsupported panel formats", async () => {
  await withTempDir(async (tempDir) => {
    const filePath = writePanel(tempDir, { format: "legacy-html" });
    await assert.rejects(
      () => runWorkbenchPanel({ flags: { file: filePath } }),
      /Unsupported Workbench panel format/
    );
  });
});
