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
    name: "doctor",
    path: "./doctor.test.js"
  }
];

let failed = false;

for (const entry of testModules) {
  try {
    const module = await import(entry.path);
    await module.run();
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${entry.name}`);
    console.error(error instanceof Error ? error.stack : String(error));
  }
}

if (failed) {
  process.exit(1);
}

console.log("All tests passed.");
