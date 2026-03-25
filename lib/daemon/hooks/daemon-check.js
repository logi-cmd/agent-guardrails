#!/usr/bin/env node
/**
 * Claude Code PostToolUse Hook — daemon-check
 *
 * Reads the latest daemon check result. If error-level findings exist,
 * outputs them to stderr with exit code 2 so Claude Code sees them.
 * Otherwise exits silently with code 0.
 *
 * Triggered by: Edit, Write, MultiEdit tool usage
 */

import fs from "node:fs";
import path from "node:path";

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const resultFile = path.join(projectDir, ".agent-guardrails", "daemon-result.json");

if (!fs.existsSync(resultFile)) process.exit(0);

try {
  const data = JSON.parse(fs.readFileSync(resultFile, "utf8"));

  if (!data.ok && data.result?.findings?.length > 0) {
    const errors = data.result.findings
      .filter(f => f.severity === "error")
      .map(f => `[${f.code}] ${f.message}`)
      .join("\n");

    if (errors) {
      process.stderr.write(`Guardrails daemon detected issues:\n${errors}\n`);
      process.exit(2);
    }
  }
} catch { /* ignore parse errors */ }

process.exit(0);
