import { startMcpServer } from "../mcp/server.js";

export async function runMcp({ locale = null } = {}) {
  void locale;
  await startMcpServer({ repoRoot: process.cwd() });
}
