const fs = require("node:fs");
const path = require("node:path");

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

function loadConfig(projectDir) {
  const configPath = path.join(projectDir, ".agent-guardrails", "config.json");
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeRelative(projectDir, filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(projectDir, filePath);
  return path.relative(projectDir, absolute).replace(/\\/g, "/");
}

function isAllowed(filePath, config) {
  const allowedPaths = config?.allowedPaths || config?.checks?.allowedPaths;
  if (!Array.isArray(allowedPaths) || allowedPaths.length === 0) {
    return { allowed: true };
  }

  const normalized = filePath.replace(/\\/g, "/");
  const matched = allowedPaths.some((entry) => {
    const pattern = String(entry).replace(/\\/g, "/").replace(/^\.\//, "");
    return normalized === pattern || normalized.startsWith(pattern.endsWith("/") ? pattern : `${pattern}/`);
  });

  if (!matched) {
    return {
      allowed: false,
      reason: `Guardrails blocked out-of-scope write to "${normalized}". Allowed paths: ${allowedPaths.join(", ")}`
    };
  }

  return { allowed: true };
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

  const projectDir = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const toolName = input.tool_name;
  if (!["Write", "Edit", "MultiEdit", "Bash"].includes(toolName)) {
    process.exit(0);
  }

  const config = loadConfig(projectDir);
  if (!config) {
    process.exit(0);
  }

  // Collect file paths to scope-check
  const pathsToCheck = [];

  if (toolName === "Bash") {
    const command = input.tool_input?.command;
    if (typeof command !== "string") {
      process.exit(0);
    }

    // Extract file paths from common file-write command patterns.
    // Simple regex approach — false negatives acceptable, false positives not.
    const patterns = [
      // sed -i (in-place edit)
      /(?:^|\s|;|&&|\|{2})\s*sed\s+(?:-[a-zA-Z]*i[a-zA-Z]*\s+)?--?\s*\S+\s+["']?(\S+?)["']?(?:\s|$)/gm,
      // tee <file>
      /(?:^|\s|;|&&|\|{2})\s*tee\s+["']?(\S+?)["']?(?:\s|$)/gm,
      // > <file> (write redirection)
      /(?:^|\s|;|&&|\|{2}).*?>\s*["']?(\S+?)["']?(?:\s|$)/gm,
      // >> <file> (append redirection)
      /(?:^|\s|;|&&|\|{2}).*?>>\s*["']?(\S+?)["']?(?:\s|$)/gm,
      // mv <src> <dest>
      /(?:^|\s|;|&&|\|{2})\s*mv\s+\S+\s+["']?(\S+?)["']?(?:\s|$)/gm,
      // cp <src> <dest>
      /(?:^|\s|;|&&|\|{2})\s*cp\s+(?:-[a-zA-Z]+\s+)*\S+\s+["']?(\S+?)["']?(?:\s|$)/gm
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(command)) !== null) {
        const candidate = match[1];
        // Skip obvious flags, /dev/null, and pipe references
        if (candidate && !candidate.startsWith("-") && candidate !== "/dev/null") {
          pathsToCheck.push(candidate);
        }
      }
    }
  } else {
    const filePath = input.tool_input?.file_path;
    if (!filePath) {
      process.exit(0);
    }
    pathsToCheck.push(filePath);
  }

  if (pathsToCheck.length === 0) {
    process.exit(0);
  }

  // Check each detected path against scope
  for (const filePath of pathsToCheck) {
    const relativePath = normalizeRelative(projectDir, filePath);
    const scopeResult = isAllowed(relativePath, config);
    if (!scopeResult.allowed) {
      const payload = {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny"
        },
        systemMessage: scopeResult.reason
      };
      process.stderr.write(`${JSON.stringify(payload)}\n`);
      process.exit(2);
    }
  }

  process.exit(0);
}

main().catch(() => {
  process.exit(0);
});
