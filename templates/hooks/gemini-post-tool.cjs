/**
 * Gemini CLI AfterTool hook — agent-guardrails post-check
 *
 * Registered in .gemini/settings.json under hooks.AfterTool.
 * Matcher: "write_file|replace|edit|run_shell_command"
 *
 * Reads JSON input from stdin (Gemini hook protocol):
 *   { tool_name, tool_input, tool_response, cwd, hook_event_name, ... }
 *
 * Runs agent-guardrails check after file-write tools and surfaces findings.
 * Exit 0 with JSON stdout { systemMessage: "..." } if findings exist.
 */
const { execFileSync } = require("node:child_process");

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function runGuardrailsCheck(projectDir) {
  const commands = [
    ["agent-guardrails", ["check", "--base-ref", "HEAD", "--json"]],
    ["npx", ["agent-guardrails", "check", "--base-ref", "HEAD", "--json"]]
  ];

  for (const [command, args] of commands) {
    try {
      const result = execFileSync(command, args, {
        cwd: projectDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 30000
      });
      if (result) {
        return JSON.parse(result);
      }
    } catch {}
  }

  return null;
}

function summarizeFindings(findings) {
  const relevant = findings.slice(0, 5).map((finding) => `- [${finding.code}] ${finding.message}`);
  if (relevant.length === 0) return null;
  return `Guardrails findings after edit:\n${relevant.join("\n")}`;
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) {
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const toolName = input.tool_name;
  if (!["write_file", "replace", "edit", "run_shell_command"].includes(toolName)) {
    process.exit(0);
  }

  const projectDir = input.cwd || process.env.GEMINI_PROJECT_DIR || process.cwd();
  const checkResult = runGuardrailsCheck(projectDir);
  const findings = checkResult?.findings || checkResult?.result?.findings || [];
  if (!Array.isArray(findings) || findings.length === 0) {
    process.exit(0);
  }

  const summary = summarizeFindings(findings);
  if (!summary) {
    process.exit(0);
  }

  // Gemini AfterTool: output systemMessage as informational context
  process.stdout.write(`${JSON.stringify({ systemMessage: summary })}\n`);
  process.exit(0);
}

main().catch(() => {
  process.exit(0);
});
