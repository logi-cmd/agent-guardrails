/**
 * Agent Guardrails Daemon Worker
 *
 * Core daemon logic shared by foreground and background modes.
 * Event-driven — no polling when idle.
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

export function parseArgs(argv = process.argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--foreground") {
      args.foreground = true;
    } else if (flag === "--repo-root" && argv[i + 1]) {
      args.repoRoot = argv[++i];
    } else if (flag === "--config" && argv[i + 1]) {
      try { args.config = JSON.parse(argv[++i]); } catch { /* ignore */ }
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export function createLogger(logFile, foreground = false) {
  function ensureDir() {
    const dir = path.dirname(logFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  function log(message) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${message}`;
    if (foreground) {
      console.log(line);
    } else {
      try {
        ensureDir();
        fs.appendFileSync(logFile, line + "\n");
      } catch { /* ignore write errors */ }
    }
  }

  return { log };
}

// ---------------------------------------------------------------------------
// Info store — tracks daemon state on disk
// ---------------------------------------------------------------------------

export function createInfoStore(infoFile, startTime) {
  const state = {
    pid: process.pid,
    startTime,
    checksRun: 0,
    lastCheck: null
  };

  function save() {
    const dir = path.dirname(infoFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(infoFile, JSON.stringify(state, null, 2));
  }

  return {
    incrementChecks() { state.checksRun++; },
    updateLastCheck() { state.lastCheck = new Date().toISOString(); },
    save
  };
}

// ---------------------------------------------------------------------------
// File watcher — chokidar with fs.watch fallback
// ---------------------------------------------------------------------------

function createFallbackWatcher(repoRoot, config, onChange, log) {
  const watchers = new Map();
  let closed = false;

  function watchDir(dir) {
    if (closed) return;
    try {
      const w = fs.watch(dir, { recursive: false }, (_eventType, filename) => {
        if (!filename) return;
        onChange(path.join(dir, filename));
      });
      watchers.set(dir, w);
    } catch { /* skip directories we can't watch */ }
  }

  function scanDirs(baseDir, depth) {
    if (closed || depth > 10) return;
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (config.ignorePatterns.some((p) => entry.name.includes(p))) continue;
        const fullPath = path.join(baseDir, entry.name);
        if (entry.isDirectory()) {
          watchDir(fullPath);
          scanDirs(fullPath, depth + 1);
        }
      }
    } catch { /* skip */ }
  }

  for (const watchPath of config.watchPaths) {
    const absolute = path.resolve(repoRoot, watchPath);
    if (fs.existsSync(absolute)) {
      watchDir(absolute);
      scanDirs(absolute, 0);
    }
  }

  return {
    close() {
      closed = true;
      for (const [, w] of watchers) w.close();
      watchers.clear();
    },
    ready: Promise.resolve()
  };
}

async function createChokidarWatcher(repoRoot, config, onChange, log) {
  const chokidar = await import("chokidar");
  const watcher = chokidar.watch(config.watchPaths, {
    cwd: repoRoot,
    ignored: config.ignorePatterns,
    persistent: true,
    ignoreInitial: true
  });

  watcher.on("change", (filePath) => onChange(filePath));
  watcher.on("add", (filePath) => onChange(filePath));

  return new Promise((resolve) => {
    watcher.on("ready", () => {
      resolve({
        close: () => watcher.close(),
        ready: Promise.resolve()
      });
    });
  });
}

export async function createWatcher(repoRoot, config, onChange, log) {
  try {
    log("Attempting to use chokidar for file watching...");
    const watcher = await createChokidarWatcher(repoRoot, config, onChange, log);
    log("chokidar initialized successfully");
    return watcher;
  } catch {
    log("chokidar unavailable, falling back to fs.watch");
    return createFallbackWatcher(repoRoot, config, onChange, log);
  }
}

// ---------------------------------------------------------------------------
// Check runner — direct import, no npx
// ---------------------------------------------------------------------------

export async function createCheckRunner(repoRoot, config, log, t) {
  let isCheckRunning = false;
  let checkTimeout = null;
  let runCount = 0;

  const { executeCheck } = await import("../commands/check.js");

  function scheduleCheck() {
    if (checkTimeout) clearTimeout(checkTimeout);
    checkTimeout = setTimeout(runCheck, config.checkInterval);
  }

  function runCheck() {
    if (isCheckRunning) {
      log(t("daemon.checkSkipped"));
      return;
    }
    isCheckRunning = true;
    runCount++;
    log(`Running guardrail check (#${runCount})...`);

    executeCheck({
      repoRoot,
      flags: { json: false },
      suppressExitCode: true
    })
      .then((result) => {
        const ok = result?.ok;
        log(ok ? "Check passed" : "Check completed with issues");
      })
      .catch((err) => {
        log(`Check error: ${err.message}`);
      })
      .finally(() => {
        isCheckRunning = false;
      });
  }

  return { scheduleCheck };
}

// ---------------------------------------------------------------------------
// Main worker entry
// ---------------------------------------------------------------------------

export async function run({ repoRoot, config, foreground = false, locale = null }) {
  const { createTranslator } = await import("../i18n.js");
  const { t } = createTranslator(locale);

  const startTime = new Date().toISOString();
  const logFile = path.join(repoRoot, ".agent-guardrails", "daemon.log");
  const infoFile = path.join(repoRoot, ".agent-guardrails", "daemon-info.json");
  const pidFile = path.join(repoRoot, ".agent-guardrails", "daemon.pid");

  const { log } = createLogger(logFile, foreground);
  const info = createInfoStore(infoFile, startTime);
  const { scheduleCheck } = await createCheckRunner(repoRoot, config, log, t);

  // Cleanup handler
  let watcher = null;
  function cleanup() {
    log("Shutting down...");
    if (watcher) watcher.close();
    try { if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile); } catch { /* ignore */ }
    try { if (fs.existsSync(infoFile)) fs.unlinkSync(infoFile); } catch { /* ignore */ }
  }

  process.on("SIGTERM", () => { cleanup(); process.exit(0); });
  process.on("SIGINT", () => { console.log(""); cleanup(); process.exit(0); });

  // Write PID file
  const dir = path.dirname(pidFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pidFile, process.pid.toString());

  log(`Daemon started with PID ${process.pid}`);
  log(`Working directory: ${repoRoot}`);
  log(`Watch paths: ${config.watchPaths.join(", ")}`);
  log(`Check interval: ${config.checkInterval}ms (debounce, not polling)`);
  if (!foreground) log("Press Ctrl+C or run 'agent-guardrails stop' to stop\n");
  info.save();

  // Start file watcher
  watcher = await createWatcher(repoRoot, config, (filePath) => {
    log(`File changed: ${filePath}`);
    info.incrementChecks();
    info.updateLastCheck();
    info.save();
    scheduleCheck();
  }, log);

  log("File watcher ready");

  // Keep process alive
  return new Promise(() => { /* never resolve */ });
}
