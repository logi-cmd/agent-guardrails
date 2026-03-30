#!/usr/bin/env node
/**
 * Gemini CLI AfterTool hook — agent-guardrails
 *
 * Place in .gemini/hooks/guardrails-check.js
 * Matcher: "write_file|replace|edit"
 * Uses shared-result-reader (cache-first, fallback-second) to avoid redundant checks.
 * Exit 2 = System Block, stderr = rejection reason → agent sees it
 * Exit 0 with JSON stdout = allow
 */

const { getResult } = require("./shared-result-reader.cjs");

const projectDir = process.env.GEMINI_PROJECT_DIR || process.cwd();

// Simple i18n for commonJS hooks
const LOCALE_G = process.env.AGENT_GUARDRAILS_LOCALE || "en";
const MESSAGES_G = {
  en: { header: "Guardrails Check Report" , errorLine: "❌ [{code}] {message}" },
  "zh-CN": { header: "Guardrails 检查报告" , errorLine: "❌ [{code}] {message}" }
};
function msgG(k){
  const m = MESSAGES_G[LOCALE_G] || MESSAGES_G["en"];
  return m[k] || k;
}

const data = getResult(projectDir);

if (!data) {
  console.log(JSON.stringify({ decision: "allow" }));
  process.exit(0);
}

const findings = data?.findings || [];
const errors = findings
  .filter(f => f.severity === "error")
  .map(f => `[${f.code}] ${f.message}`)
  .join("\n");

if (errors) {
  process.stderr.write(`\n${msgG("header")}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  errors.split("\n").forEach(e => {
    const line = msgG("errorLine").replace("{code}", (e.match(/\[(.*?)\]/) || [])[1] ?? "").replace("{message}", e.replace(/\[[^\]]+\] /, ""));
    process.stderr.write(`- ${line}\n`);
  });
  process.stderr.write("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  process.exit(2);
}

console.log(JSON.stringify({ decision: "allow" }));
process.exit(0);
