import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runInit } from "../lib/commands/init.js";

function captureLogs(run) {
  const original = console.log;
  let output = "";
  console.log = (...args) => {
    output += `${args.join(" ")}\n`;
  };

  return Promise.resolve()
    .then(run)
    .then(() => output)
    .finally(() => {
      console.log = original;
    });
}

export async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-init-"));

  const output = await captureLogs(() =>
    runInit({
      positional: [tempDir],
      flags: { preset: "nextjs", adapter: "codex,claude-code,cursor,openhands,openclaw", lang: "en" },
      locale: "en"
    })
  );

  assert.equal(fs.existsSync(path.join(tempDir, "AGENTS.md")), true);
  assert.equal(fs.existsSync(path.join(tempDir, "OPENCLAW.md")), true);
  assert.equal(fs.existsSync(path.join(tempDir, "CLAUDE.md")), true);
  assert.equal(fs.existsSync(path.join(tempDir, ".cursor", "rules", "agent-guardrails.mdc")), true);
  assert.equal(fs.existsSync(path.join(tempDir, ".agents", "skills", "agent-guardrails.md")), true);
  assert.equal(fs.existsSync(path.join(tempDir, "docs", "PROJECT_STATE.md")), true);
  assert.equal(fs.existsSync(path.join(tempDir, ".agent-guardrails", "config.json")), true);

  const config = JSON.parse(
    fs.readFileSync(path.join(tempDir, ".agent-guardrails", "config.json"), "utf8")
  );

  assert.equal(config.preset, "nextjs");
  assert.match(output, /--intended-files "src\/file\.js,tests\/file\.test\.js"/);
  assert.match(output, /--required-commands "npm test"/);
  assert.match(output, /\.agent-guardrails\/evidence\/current-task\.md/);
  assert.match(output, /--commands-run "npm test" --review/);

  const agentsTemplate = fs.readFileSync(path.join(tempDir, "AGENTS.md"), "utf8");
  const claudeTemplate = fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf8");
  const cursorTemplate = fs.readFileSync(
    path.join(tempDir, ".cursor", "rules", "agent-guardrails.mdc"),
    "utf8"
  );
  const openhandsTemplate = fs.readFileSync(
    path.join(tempDir, ".agents", "skills", "agent-guardrails.md"),
    "utf8"
  );
  const openclawTemplate = fs.readFileSync(path.join(tempDir, "OPENCLAW.md"), "utf8");

  for (const content of [
    agentsTemplate,
    claudeTemplate,
    cursorTemplate,
    openhandsTemplate,
    openclawTemplate
  ]) {
    assert.match(content, /--intended-files/);
    assert.match(content, /--required-commands "npm test"/);
    assert.match(content, /\.agent-guardrails\/evidence\/current-task\.md/);
    assert.match(content, /--commands-run "npm test"/);
  }
}
