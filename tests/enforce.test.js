import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runEnforce, runUnenforce } from "../lib/commands/enforce.js";

const MARKER_START = "<!-- agent-guardrails-enforce:start -->";
const MARKER_END = "<!-- agent-guardrails-enforce:end -->";

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ag-enforce-test-"));
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
  return dir;
}

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

function readFileOrNull(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function hasMarkers(filePath) {
  const content = readFileOrNull(filePath);
  if (!content) return false;
  return content.includes(MARKER_START) && content.includes(MARKER_END);
}

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const ALL_AGENT_FILES = [
  "CLAUDE.md",
  path.join(".cursor", "rules", "agent-guardrails-enforce.mdc"),
  "AGENTS.md",
  path.join(".codex", "instructions.md"),
  "GEMINI.md"
];

const ALL_AGENT_IDS = ["claude-code", "cursor", "opencode", "codex", "gemini"];

export async function run() {
  const repos = [];
  const savedCwd = process.cwd();

  function inRepo(repo) {
    repos.push(repo);
    process.chdir(repo);
    return repo;
  }

  try {

    // ── 1. enforce --all writes markers for all supported agents ──
    {
      const repo = inRepo(makeTempRepo());

      await captureLogs(() =>
        runEnforce({ positional: [], flags: { all: true, lang: "en" }, locale: "en" })
      );

      for (const rel of ALL_AGENT_FILES) {
        const full = path.join(repo, rel);
        assert.ok(fs.existsSync(full), `enforce --all should create ${rel}`);
        assert.ok(hasMarkers(full), `${rel} should contain enforce markers`);
      }

      const repo2 = inRepo(makeTempRepo());
      const { output: jsonOut } = await captureLogs(() =>
        runEnforce({ positional: [], flags: { all: true, json: true, lang: "en" }, locale: "en" })
      );
      const parsed = JSON.parse(jsonOut);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.written.length, 5, "all 5 agent files should be written");
      assert.equal(parsed.skipped.length, 0);
      for (const id of ALL_AGENT_IDS) {
        assert.ok(parsed.agents.includes(id), `agents should include ${id}`);
      }
    }

    // ── 2. enforce --agent claude-code only affects Claude path ──
    {
      const repo = inRepo(makeTempRepo());

      await captureLogs(() =>
        runEnforce({ positional: [], flags: { agent: "claude-code", lang: "en" }, locale: "en" })
      );

      const claudeMd = path.join(repo, "CLAUDE.md");
      assert.ok(fs.existsSync(claudeMd), "CLAUDE.md should exist");
      assert.ok(hasMarkers(claudeMd), "CLAUDE.md should have markers");

      const otherFiles = [
        path.join(".cursor", "rules", "agent-guardrails-enforce.mdc"),
        path.join(".codex", "instructions.md"),
        "GEMINI.md"
      ];
      for (const rel of otherFiles) {
        assert.ok(!fs.existsSync(path.join(repo, rel)), `${rel} should NOT exist for claude-code only`);
      }

      const agentsMd = path.join(repo, "AGENTS.md");
      assert.ok(
        !fs.existsSync(agentsMd) || !hasMarkers(agentsMd),
        "AGENTS.md should not have enforce markers when only claude-code is targeted"
      );
    }

    // ── 3. Repeated enforce is idempotent / skipped safely ──
    {
      const repo = inRepo(makeTempRepo());

      const { output: out1 } = await captureLogs(() =>
        runEnforce({ positional: [], flags: { agent: "claude-code", json: true, lang: "en" }, locale: "en" })
      );
      const json1 = JSON.parse(out1);
      assert.equal(json1.written.length, 1, "first run should write 1 file");

      const claudeMd = path.join(repo, "CLAUDE.md");
      const content1 = fs.readFileSync(claudeMd, "utf8");

      const { output: out2 } = await captureLogs(() =>
        runEnforce({ positional: [], flags: { agent: "claude-code", json: true, lang: "en" }, locale: "en" })
      );
      const json2 = JSON.parse(out2);
      assert.equal(json2.written.length, 0, "second run should write nothing");
      assert.equal(json2.skipped.length, 1, "second run should skip 1 file");

      const content2 = fs.readFileSync(claudeMd, "utf8");
      assert.equal(content1, content2, "file content must be identical after repeated enforce");
    }

    // ── 4. unenforce removes only injected blocks, preserves surrounding content ──
    {
      const repo = inRepo(makeTempRepo());

      const claudeMd = path.join(repo, "CLAUDE.md");
      const userContent = "# My Project\n\nThis is my custom CLAUDE.md content.\nDo not delete this.";
      fs.writeFileSync(claudeMd, userContent, "utf8");

      await captureLogs(() =>
        runEnforce({ positional: [], flags: { agent: "claude-code", lang: "en" }, locale: "en" })
      );

      const afterEnforce = fs.readFileSync(claudeMd, "utf8");
      assert.ok(afterEnforce.includes(MARKER_START), "enforced file should have start marker");
      assert.ok(afterEnforce.includes(userContent), "user content should be preserved after enforce");

      await captureLogs(() =>
        runUnenforce({ positional: [], flags: { agent: "claude-code", lang: "en" }, locale: "en" })
      );

      assert.ok(fs.existsSync(claudeMd), "CLAUDE.md should still exist after unenforce");
      const afterUnenforce = fs.readFileSync(claudeMd, "utf8");
      assert.ok(!afterUnenforce.includes(MARKER_START), "markers should be removed after unenforce");
      assert.ok(!afterUnenforce.includes(MARKER_END), "end marker should be removed");
      assert.ok(afterUnenforce.includes("My Project"), "user content heading preserved");
      assert.ok(afterUnenforce.includes("custom CLAUDE.md content"), "user content body preserved");
      assert.ok(afterUnenforce.includes("Do not delete this"), "user content tail preserved");
    }

    // ── 5. unenforce on a file with ONLY injected content deletes it ──
    {
      const repo = inRepo(makeTempRepo());

      await captureLogs(() =>
        runEnforce({ positional: [], flags: { agent: "gemini", lang: "en" }, locale: "en" })
      );

      const geminiMd = path.join(repo, "GEMINI.md");
      assert.ok(fs.existsSync(geminiMd), "GEMINI.md should exist after enforce");

      const { output: unenforceOut } = await captureLogs(() =>
        runUnenforce({ positional: [], flags: { agent: "gemini", json: true, lang: "en" }, locale: "en" })
      );

      assert.ok(!fs.existsSync(geminiMd), "GEMINI.md should be deleted after unenforce (no user content)");

      const unenforceJson = JSON.parse(unenforceOut);
      assert.equal(unenforceJson.removed.length, 1);
      assert.equal(unenforceJson.removed[0].action, "deleted");
    }

    // ── 6. unenforce --all removes all enforced files ──
    {
      const repo = inRepo(makeTempRepo());

      await captureLogs(() =>
        runEnforce({ positional: [], flags: { all: true, lang: "en" }, locale: "en" })
      );

      for (const rel of ALL_AGENT_FILES) {
        assert.ok(fs.existsSync(path.join(repo, rel)), `${rel} should exist after enforce --all`);
      }

      const { output: unenforceOut } = await captureLogs(() =>
        runUnenforce({ positional: [], flags: { all: true, json: true, lang: "en" }, locale: "en" })
      );
      const unenforceJson = JSON.parse(unenforceOut);
      assert.equal(unenforceJson.removed.length, 5, "all 5 files should be removed");

      for (const rel of ALL_AGENT_FILES) {
        assert.ok(!fs.existsSync(path.join(repo, rel)), `${rel} should be deleted after unenforce --all`);
      }
    }

    // ── 7. Unknown agent throws error ──
    {
      inRepo(makeTempRepo());

      await assert.rejects(
        () =>
          runEnforce({ positional: [], flags: { agent: "unknown-agent", lang: "en" }, locale: "en" }),
        { message: /unknown-agent/ }
      );

      await assert.rejects(
        () =>
          runUnenforce({ positional: [], flags: { agent: "unknown-agent", lang: "en" }, locale: "en" }),
        { message: /unknown-agent/ }
      );
    }

    // ── 8. Round-trip: enforce + unenforce for --agent claude-code is clean ──
    {
      const repo = inRepo(makeTempRepo());

      await captureLogs(() =>
        runEnforce({ positional: [], flags: { agent: "claude-code", lang: "en" }, locale: "en" })
      );
      const claudeMd = path.join(repo, "CLAUDE.md");
      assert.ok(hasMarkers(claudeMd));

      await captureLogs(() =>
        runUnenforce({ positional: [], flags: { agent: "claude-code", lang: "en" }, locale: "en" })
      );
      assert.ok(!fs.existsSync(claudeMd), "file with only injected content should be fully removed");

      await captureLogs(() =>
        runEnforce({ positional: [], flags: { agent: "claude-code", lang: "en" }, locale: "en" })
      );
      assert.ok(hasMarkers(claudeMd), "re-enforce after removal should insert markers again");
    }

    // ── 9. Unenforce on non-existent file is safe ──
    {
      inRepo(makeTempRepo());

      const { output: unenforceOut } = await captureLogs(() =>
        runUnenforce({ positional: [], flags: { agent: "claude-code", json: true, lang: "en" }, locale: "en" })
      );
      const unenforceJson = JSON.parse(unenforceOut);
      assert.equal(unenforceJson.ok, true);
      assert.equal(unenforceJson.removed.length, 0, "nothing to remove");
      assert.ok(unenforceJson.skipped.length >= 1, "should report skipped");
      assert.equal(unenforceJson.skipped[0].reason, "not-found");
    }

    // ── 10. Enforce appends to existing file, unenforce restores it ──
    {
      const repo = inRepo(makeTempRepo());

      const codexDir = path.join(repo, ".codex");
      fs.mkdirSync(codexDir, { recursive: true });
      const instructionsMd = path.join(codexDir, "instructions.md");
      fs.writeFileSync(instructionsMd, "# Existing Codex Instructions\n\nSome rules here.", "utf8");

      await captureLogs(() =>
        runEnforce({ positional: [], flags: { agent: "codex", lang: "en" }, locale: "en" })
      );

      const content = fs.readFileSync(instructionsMd, "utf8");
      assert.ok(content.includes("Existing Codex Instructions"), "original content preserved");
      assert.ok(content.includes(MARKER_START), "markers appended");
      assert.ok(content.indexOf("Existing Codex Instructions") < content.indexOf(MARKER_START),
        "user content should appear before markers");

      await captureLogs(() =>
        runUnenforce({ positional: [], flags: { agent: "codex", lang: "en" }, locale: "en" })
      );

      const restored = fs.readFileSync(instructionsMd, "utf8");
      assert.ok(!restored.includes(MARKER_START), "markers removed");
      assert.ok(restored.includes("Existing Codex Instructions"), "original heading preserved after unenforce");
      assert.ok(restored.includes("Some rules here"), "original body preserved after unenforce");
    }

  } finally {
    process.chdir(savedCwd);
    for (const repo of repos) {
      rmrf(repo);
    }
  }
}
