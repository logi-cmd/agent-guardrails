import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const testModules = [
  {
    name: "init",
    path: "./init.test.js"
  },
  {
    name: "setup",
    path: "./setup.test.js"
  },
  {
    name: "plan",
    path: "./plan.test.js"
  },
  {
    name: "i18n",
    path: "./i18n.test.js"
  },
  {
    name: "check",
    path: "./check.test.js"
  },
  {
    name: "enforce",
    path: "./enforce.test.js"
  },
  {
    name: "plugin-ts",
    path: "./plugin-ts.test.js"
  },
  {
    name: "benchmark",
    path: "./benchmark.test.js"
  },
  {
    name: "runtime",
    path: "./runtime.test.js"
  },
  {
    name: "rust-runtime",
    path: "./rust-runtime.test.js"
  },
  {
    name: "npm-pack",
    path: "./npm-pack.test.js"
  },
  {
    name: "rust-native-build",
    path: "./rust-native-build.test.js"
  },
  {
    name: "agent-loop",
    path: "./agent-loop.test.js"
  },
  {
    name: "auto-fix",
    path: "./auto-fix.test.js"
  },
  {
    name: "mcp",
    path: "./mcp.test.js"
  },
  {
    name: "serve",
    path: "./serve.test.js"
  },
  {
    name: "daemon",
    path: "./daemon.test.js"
  },
  {
    name: "shared-result-reader",
    path: "./shared-result-reader.test.js"
  },
  {
    name: "daemon-check",
    path: "./daemon-check.test.js"
  },
  {
    name: "daemon-hooks",
    path: "./daemon-hooks.test.js"
  },
  {
    name: "release",
    path: "./release.test.js"
  },
  {
    name: "config-validation",
    path: "./config-validation.test.js"
  },
  {
    name: "policy",
    path: "./policy.test.js"
  },
  {
    name: "doctor",
    path: "./doctor.test.js"
  },
  {
    name: "pro-status",
    path: "./pro-status.test.js",
    mode: "node-test"
  },
  {
    name: "workbench-panel",
    path: "./workbench-panel.test.js",
    mode: "node-test"
  },
  {
    name: "pro-stub",
    path: "./pro-stub.test.js",
    mode: "node-test"
  }
];

let failed = false;

function runNodeTestFile(relativePath) {
  const filePath = fileURLToPath(new URL(relativePath, import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", filePath], {
      stdio: "inherit",
      windowsHide: true
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`node --test exited with code ${code ?? 1}`));
    });
  });
}

for (const entry of testModules) {
  try {
    process.exitCode = 0;
    if (entry.mode === "node-test") {
      await runNodeTestFile(entry.path);
    } else {
      const module = await import(entry.path);
      await module.run();
    }
    process.exitCode = 0;
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    process.exitCode = 0;
    failed = true;
    console.error(`FAIL ${entry.name}`);
    console.error(error instanceof Error ? error.stack : String(error));
  }
}

if (failed) {
  process.exit(1);
}

console.log("All tests passed.");
