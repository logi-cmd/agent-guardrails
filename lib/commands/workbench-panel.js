import fs from "node:fs";
import path from "node:path";
import { renderWorkbenchPanelText } from "../pro/workbench-panel.js";

const DEFAULT_PANEL_PATH = ".agent-guardrails/pro/operator-workbench-panel.json";
const PANEL_FORMAT = "agent-guardrails-workbench-panel.v1";

function resolvePanelPath(positional = [], flags = {}) {
  return path.resolve(
    process.cwd(),
    String(flags.file || flags.from || positional[0] || DEFAULT_PANEL_PATH)
  );
}

function readWorkbenchPanel(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const panel = JSON.parse(raw.trimStart().replace(/^\uFEFF/, ""));
  if (!panel || typeof panel !== "object" || panel.format !== PANEL_FORMAT) {
    throw new Error(`Unsupported Workbench panel format. Expected ${PANEL_FORMAT}.`);
  }
  return panel;
}

function printWorkbenchPanelHelp() {
  console.log(`agent-guardrails workbench-panel

Usage:
  agent-guardrails workbench-panel [--file <operator-workbench-panel.json>] [--json]

Renders a local Pro Workbench panel model without requiring the browser or raw JSON.`);
}

export async function runWorkbenchPanel({ positional = [], flags = {} } = {}) {
  if (flags.help || flags.h) {
    printWorkbenchPanelHelp();
    return null;
  }

  const filePath = resolvePanelPath(positional, flags);
  const panel = readWorkbenchPanel(filePath);
  if (flags.json) {
    console.log(JSON.stringify(panel, null, 2));
    return panel;
  }

  console.log(renderWorkbenchPanelText(panel));
  return panel;
}
