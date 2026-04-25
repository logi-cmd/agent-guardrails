import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runDoctor, runDoctorChecks } from "../lib/commands/doctor.js";
import { runSetup } from "../lib/commands/setup.js";

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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-doctor-"));

  const result = await runDoctor({
    positional: [tempDir],
    flags: { lang: "en" },
    locale: "en"
  });

  assert.equal(result.ok, false, "Fresh repo should not pass doctor checks");

  const failedChecks = result.results.filter((r) => !r.passed);
  assert.ok(failedChecks.length > 0, "Should have failed checks for fresh repo");

  const configCheck = result.results.find((r) => r.key === "configExists");
  assert.equal(configCheck.passed, false, "Config should be missing on fresh repo");

  const gitHookCheck = result.results.find((r) => r.key === "gitHook");
  assert.equal(gitHookCheck.passed, false, "Git hook should be missing on fresh repo");

  const enforcedCheck = result.results.find((r) => r.key === "enforced");
  assert.equal(enforcedCheck.passed, false, "Enforcement should be missing on fresh repo");

  const cliBinaryCheck = result.results.find((r) => r.key === "cliBinary");
  assert.equal(cliBinaryCheck.passed, true, "CLI binary should be available");

  const runtimeCheck = result.results.find((r) => r.key === "checkRuntime");
  assert.equal(runtimeCheck.passed, true, "Check runtime selection should be available");
  assert.match(runtimeCheck.detail, /Check runtime:/);

  await runSetup({
    positional: [tempDir],
    flags: { agent: "claude-code", lang: "en" },
    locale: "en"
  });

  const resultAfterSetup = await runDoctor({
    positional: [tempDir],
    flags: { lang: "en" },
    locale: "en"
  });

  assert.equal(resultAfterSetup.ok, false, "Should still fail (no enforcement, no git)");

  const configCheckAfter = resultAfterSetup.results.find((r) => r.key === "configExists");
  assert.equal(configCheckAfter.passed, true, "Config should exist after setup");

  const agentCheckAfter = resultAfterSetup.results.find((r) => r.key === "agentSetupFiles");
  assert.equal(agentCheckAfter.passed, true, "Agent setup files should be present after setup");

  const rawChecks = runDoctorChecks(tempDir);
  assert.equal(Array.isArray(rawChecks), true);
  assert.equal(rawChecks.length, 6);

  const { output: jsonOutput } = await captureLogs(() =>
    runDoctor({
      positional: [tempDir],
      flags: { json: true, lang: "en" },
      locale: "en"
    })
  );

  const parsed = JSON.parse(jsonOutput);
  assert.equal(parsed.ok, false);
  assert.equal(Array.isArray(parsed.checks), true);
  assert.equal(parsed.checks.length, 6);

  const { output: textOutput } = await captureLogs(() =>
    runDoctor({
      positional: [tempDir],
      flags: { lang: "en" },
      locale: "en"
    })
  );
  assert.match(textOutput, /Agent Guardrails Doctor/);
  assert.match(textOutput, /\d+\/6/);
  assert.match(textOutput, /Check runtime/);

  const zhDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-doctor-zh-"));
  await runSetup({
    positional: [zhDir],
    flags: { agent: "claude-code", lang: "en" },
    locale: "en"
  });

  const { output: zhOutput } = await captureLogs(() =>
    runDoctor({
      positional: [zhDir],
      flags: { lang: "zh-CN" },
      locale: "zh-CN"
    })
  );
  assert.match(zhOutput, /安装诊断/);
}
