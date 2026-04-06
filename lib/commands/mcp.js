import { resolveRepoRoot } from "../utils.js";
import { startMcpServer } from "../mcp/server.js";

export async function runMcp({ locale = null } = {}) {
  void locale;
  await startMcpServer({ repoRoot: resolveRepoRoot(process.cwd()) });
}
