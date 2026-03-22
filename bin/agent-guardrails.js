#!/usr/bin/env node

import { runCli } from "../lib/cli.js";

runCli(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`agent-guardrails: ${message}`);
  process.exit(1);
});
