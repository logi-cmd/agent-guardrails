import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSetup } from "../lib/commands/setup.js";

const agentExpectations = [
  { agent: "codex", helperFile: null, expectsPaste: true },
  { agent: "claude-code", helperFile: "CLAUDE.md", expectsPaste: false },
  { agent: "cursor", helperFile: path.join(".cursor", "rules", "agent-guardrails.mdc"), expectsPaste: false },
  { agent: "openhands", helperFile: path.join(".agents", "skills", "agent-guardrails.md"), expectsPaste: false },
  { agent: "openclaw", helperFile: "OPENCLAW.md", expectsPaste: false },
  { agent: "gemini", helperFile: "GEMINI.md", expectsPaste: true },
  { agent: "opencode", helperFile: path.join(".opencode", "rules", "agent-guardrails.md"), expectsPaste: false },
  { agent: "windsurf", helperFile: path.join(".windsurf", "rules", "agent-guardrails.md"), expectsPaste: false }
];

function captureLogs(run) {
  const original = console.log;
  let output = "";
  console.log = (...args) => {
    output += `${args.join(" ")}\n`;
  };

  return Promise.resolve()
    .then(run)
    .then((value) => ({ value, output }))
    .finally(() => {
      console.log = original;
    });
}

export async function run() {
  for (const { agent, helperFile, expectsPaste } of agentExpectations) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `agent-guardrails-setup-${agent}-`));
    const { value: result, output } = await captureLogs(() =>
      runSetup({
        positional: [tempDir],
        flags: { agent, lang: "en" },
        locale: "en"
      })
    );

    assert.equal(result.ok, true);
    assert.equal(result.initialization.autoInitialized, true);
    assert.equal(result.initialization.preset, "node-service");
    assert.equal(fs.existsSync(path.join(tempDir, ".agent-guardrails", "config.json")), true);
    assert.match(output, /Agent Guardrails Setup/);
    assert.match(output, /Already done/);
    assert.match(output, /Do this now/);
    assert.match(output, /Canonical MCP chat flow/);
    assert.match(output, /First chat message/);
    assert.match(output, /You will get/);
    assert.match(output, /Next step/);
    assert.match(output, /Pilot record file/);
    assert.match(output, /Cross-entry pilot summary/);
    assert.match(output, /start_agent_native_loop/);
    assert.match(output, /finish_agent_native_loop/);
    assert.match(output, /```/);
    assert.ok(result.mcp.snippet.length > 0);
    assert.ok(result.mcp.targetLocationDescription.length > 0);
    assert.ok(result.firstChatPrompt.length > 0);
    assert.ok(result.pilot.recordPath.endsWith(`${agent}.md`));
    assert.equal(result.pilot.summaryPath, "docs/pilots/SUMMARY.md");
    if (expectsPaste) {
      assert.ok(result.remainingManualStep.includes("paste the MCP snippet"));
    } else {
      assert.ok(result.remainingManualStep.includes("point it at"));
    }

    if (helperFile) {
      assert.equal(fs.existsSync(path.join(tempDir, helperFile)), true);
    }
  }

  const presetDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-setup-preset-"));
  const presetResult = await runSetup({
    positional: [presetDir],
    flags: { agent: "cursor", preset: "nextjs", lang: "en" },
    locale: "en"
  });
  const presetConfig = JSON.parse(
    fs.readFileSync(path.join(presetDir, ".agent-guardrails", "config.json"), "utf8")
  );
  assert.equal(presetResult.initialization.preset, "nextjs");
  assert.equal(presetConfig.preset, "nextjs");

  const writeDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-setup-write-"));
  const { value: writeResult, output: writeOutput } = await captureLogs(() =>
    runSetup({
      positional: [writeDir],
      flags: { agent: "claude-code", "write-repo-config": true, lang: "en" },
      locale: "en"
    })
  );
  assert.equal(fs.existsSync(path.join(writeDir, ".mcp.json")), true);
  assert.equal(writeResult.mcp.repoConfigWrite.wrote, true);
  assert.equal(writeResult.mcp.repoConfigWrite.configPath, ".mcp.json");
  assert.match(writeOutput, /Repo-local agent config written: \.mcp\.json/);
  assert.match(writeOutput, /Do this now/);
  assert.ok(writeResult.remainingManualStep.includes("send the first chat message"));
  assert.ok(!writeResult.remainingManualStep.includes("paste the MCP snippet"));

  const openhandsWriteDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-setup-write-openhands-"));
  const { value: openhandsWriteResult, output: openhandsWriteOutput } = await captureLogs(() =>
    runSetup({
      positional: [openhandsWriteDir],
      flags: { agent: "openhands", "write-repo-config": true, lang: "en" },
      locale: "en"
    })
  );
  assert.equal(fs.existsSync(path.join(openhandsWriteDir, ".openhands", "mcp.json")), true);
  assert.equal(openhandsWriteResult.mcp.repoConfigWrite.wrote, true);
  assert.equal(openhandsWriteResult.mcp.repoConfigWrite.configPath, ".openhands/mcp.json");
  assert.match(openhandsWriteOutput, /Repo-local agent config written: \.openhands\/mcp\.json/);
  assert.match(openhandsWriteOutput, /Do this now/);
  assert.ok(openhandsWriteResult.remainingManualStep.includes("point it at .openhands/mcp.json"));

  const openclawWriteDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-setup-write-openclaw-"));
  const { value: openclawWriteResult, output: openclawWriteOutput } = await captureLogs(() =>
    runSetup({
      positional: [openclawWriteDir],
      flags: { agent: "openclaw", "write-repo-config": true, lang: "en" },
      locale: "en"
    })
  );
  assert.equal(fs.existsSync(path.join(openclawWriteDir, ".openclaw", "mcp.json")), true);
  assert.equal(openclawWriteResult.mcp.repoConfigWrite.wrote, true);
  assert.equal(openclawWriteResult.mcp.repoConfigWrite.configPath, ".openclaw/mcp.json");
  assert.match(openclawWriteOutput, /Repo-local agent config written: \.openclaw\/mcp\.json/);
  assert.match(openclawWriteOutput, /Do this now/);
  assert.ok(openclawWriteResult.remainingManualStep.includes("point it at .openclaw/mcp.json"));

  const opencodeWriteDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-setup-write-opencode-"));
  const { value: opencodeWriteResult, output: opencodeWriteOutput } = await captureLogs(() =>
    runSetup({
      positional: [opencodeWriteDir],
      flags: { agent: "opencode", "write-repo-config": true, lang: "en" },
      locale: "en"
    })
  );
  assert.equal(fs.existsSync(path.join(opencodeWriteDir, ".opencode", "mcp.json")), true);
  assert.equal(opencodeWriteResult.mcp.repoConfigWrite.wrote, true);
  assert.equal(opencodeWriteResult.mcp.repoConfigWrite.configPath, ".opencode/mcp.json");
  assert.match(opencodeWriteOutput, /Repo-local agent config written: \.opencode\/mcp\.json/);
  assert.match(opencodeWriteOutput, /Do this now/);
  assert.ok(opencodeWriteResult.remainingManualStep.includes("point it at .opencode/mcp.json"));

  const windsurfWriteDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-setup-write-windsurf-"));
  const { value: windsurfWriteResult, output: windsurfWriteOutput } = await captureLogs(() =>
    runSetup({
      positional: [windsurfWriteDir],
      flags: { agent: "windsurf", "write-repo-config": true, lang: "en" },
      locale: "en"
    })
  );
  assert.equal(fs.existsSync(path.join(windsurfWriteDir, ".windsurf", "mcp.json")), true);
  assert.equal(windsurfWriteResult.mcp.repoConfigWrite.wrote, true);
  assert.equal(windsurfWriteResult.mcp.repoConfigWrite.configPath, ".windsurf/mcp.json");
  assert.match(windsurfWriteOutput, /Repo-local agent config written: \.windsurf\/mcp\.json/);
  assert.match(windsurfWriteOutput, /Do this now/);
  assert.ok(windsurfWriteResult.remainingManualStep.includes("point it at .windsurf/mcp.json"));

  const unsupportedWriteDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-setup-write-unsupported-"));
  const { value: unsupportedWriteResult, output: unsupportedWriteOutput } = await captureLogs(() =>
    runSetup({
      positional: [unsupportedWriteDir],
      flags: { agent: "codex", "write-repo-config": true, lang: "en" },
      locale: "en"
    })
  );
  assert.equal(unsupportedWriteResult.mcp.repoConfigWrite.wrote, false);
  assert.equal(unsupportedWriteResult.mcp.repoConfigWrite.supported, false);
  assert.match(unsupportedWriteOutput, /Prepared the agent config snippet/);

  const jsonDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-setup-json-"));
  const { output: jsonOutput } = await captureLogs(() =>
    runSetup({
      positional: [jsonDir],
      flags: { agent: "codex", json: true, lang: "en" },
      locale: "en"
    })
  );
  const parsed = JSON.parse(jsonOutput);
  assert.equal(parsed.agent.id, "codex");
  assert.equal(Array.isArray(parsed.canonicalFlow), true);
  assert.ok(parsed.mcp.snippet.length > 0);
  assert.equal(Array.isArray(parsed.completedSteps), true);
  assert.equal(typeof parsed.pilot.recordPath, "string");
  assert.equal(parsed.pilot.summaryPath, "docs/pilots/SUMMARY.md");
  assert.ok(parsed.remainingManualStep.length > 0);

  await assert.rejects(
    () =>
      runSetup({
        positional: [],
        flags: { agent: "unknown-agent", lang: "en" },
        locale: "en"
      }),
    /Unknown adapter/
  );
}
