/**
 * Agent Guardrails Daemon Mode
 *
 * Event-driven file watcher — zero resource usage when idle.
 *
 * Usage:
 *   agent-guardrails start [--foreground]   - Start daemon (--foreground for terminal)
 *   agent-guardrails stop                   - Stop daemon
 *   agent-guardrails status                 - Show status
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createTranslator } from "../i18n.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DAEMON_PID_FILE = ".agent-guardrails/daemon.pid";
const DAEMON_LOG_FILE = ".agent-guardrails/daemon.log";
const DAEMON_CONFIG_FILE = ".agent-guardrails/daemon.json";
const DAEMON_INFO_FILE = ".agent-guardrails/daemon-info.json";

/**
 * 默认守护配置
 */
const DEFAULT_DAEMON_CONFIG = {
  enabled: true,
  watchPaths: ["src/", "lib/", "tests/"],
  ignorePatterns: ["node_modules", ".git", "dist", "coverage"],
  checkInterval: 5000,
  notifications: {
    sound: false,
    desktop: false
  },
  autoFix: false,
  blockOnHighRisk: true
};

/**
 * 获取守护配置
 */
export function getDaemonConfig(repoRoot) {
  const configPath = path.join(repoRoot, DAEMON_CONFIG_FILE);

  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, "utf8");
      return { ...DEFAULT_DAEMON_CONFIG, ...JSON.parse(content) };
    } catch {
      // 配置解析失败，使用默认
    }
  }

  return DEFAULT_DAEMON_CONFIG;
}

/**
 * 写入守护配置
 */
export function writeDaemonConfig(repoRoot, config) {
  const configPath = path.join(repoRoot, DAEMON_CONFIG_FILE);
  const dir = path.dirname(configPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

/**
 * 检查守护进程是否运行
 */
export function isDaemonRunning(repoRoot) {
  const pidFile = path.join(repoRoot, DAEMON_PID_FILE);

  if (!fs.existsSync(pidFile)) {
    return { running: false };
  }

  try {
    const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);

    if (Number.isNaN(pid)) {
      return { running: false };
    }

    // 跨平台检查进程
    let running = false;
    try {
      if (process.platform === "win32") {
        const result = spawnSync("tasklist", ["/FI", `PID eq ${pid}`], {
          encoding: "utf8",
          timeout: 5000
        });
        // 精确匹配 PID，避免 "123" 匹配 "1234"
        running = new RegExp(`\\b${pid}\\b`).test(result.stdout);
      } else {
        process.kill(pid, 0);
        running = true;
      }
    } catch {
      running = false;
    }

    if (!running) {
      fs.unlinkSync(pidFile);
      return { running: false };
    }

    // 读取守护进程信息
    const infoFile = path.join(repoRoot, DAEMON_INFO_FILE);
    let info = {};
    if (fs.existsSync(infoFile)) {
      try {
        info = JSON.parse(fs.readFileSync(infoFile, "utf8"));
      } catch {
        // ignore
      }
    }

    return {
      running: true,
      pid,
      startTime: info.startTime,
      checksRun: info.checksRun || 0,
      lastCheck: info.lastCheck
    };
  } catch {
    return { running: false };
  }
}

/**
 * 事件驱动等待 PID 文件出现（替代 busy-wait 轮询）
 */
async function waitForPidFile(pidFile, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (fs.existsSync(pidFile)) {
      try { resolve(fs.readFileSync(pidFile, "utf8").trim()); } catch { resolve(null); }
      return;
    }

    const dir = path.dirname(pidFile);
    let watcher;
    const timer = setTimeout(() => {
      if (watcher) watcher.close();
      // 最终检查一次
      if (fs.existsSync(pidFile)) {
        try { resolve(fs.readFileSync(pidFile, "utf8").trim()); } catch { resolve(null); }
      } else {
        resolve(null);
      }
    }, timeoutMs);

    try {
      watcher = fs.watch(dir, (eventType) => {
        if (eventType === "rename" && fs.existsSync(pidFile)) {
          clearTimeout(timer);
          watcher.close();
          try { resolve(fs.readFileSync(pidFile, "utf8").trim()); } catch { resolve(null); }
        }
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/**
 * 启动守护进程
 */
export async function startDaemon(repoRoot, options = {}) {
  const locale = options.locale || null;
  const foreground = options.foreground || false;
  const { t } = createTranslator(locale);

  // 检查是否已运行
  const status = isDaemonRunning(repoRoot);
  if (status.running && !foreground) {
    console.log(`\n${t("daemon.alreadyRunning")}`);
    console.log(`  PID: ${status.pid}`);
    console.log(`  ${t("daemon.startTime")}: ${status.startTime || "unknown"}`);
    console.log(`\n  ${t("daemon.useStop")}`);
    return { success: false, reason: "already_running", status };
  }

  const config = getDaemonConfig(repoRoot);

  // 前台模式 — 直接调用 worker.run()
  if (foreground) {
    const { run } = await import("../daemon/worker.js");
    return run({ repoRoot, config, foreground: true, locale });
  }

  // 后台模式 — spawn worker.js 子进程
  console.log(`\n${t("daemon.starting")}\n`);

  const workerPath = path.resolve(__dirname, "..", "daemon", "worker.js");
  const pidFile = path.join(repoRoot, DAEMON_PID_FILE);

  const child = spawn(process.execPath, [
    workerPath,
    "--repo-root", repoRoot,
    "--config", JSON.stringify(config)
  ], {
    detached: true,
    stdio: "ignore",
    cwd: repoRoot
  });

  child.unref();

  // 事件驱动等待 PID 文件（替代 busy-wait）
  const pid = await waitForPidFile(pidFile, 5000);

  if (pid) {
    console.log(`${t("daemon.started")}`);
    console.log(`  PID: ${pid}`);
    console.log(`\n${t("daemon.logFile")}: ${DAEMON_LOG_FILE}`);
    console.log(`${t("daemon.configFile")}: ${DAEMON_CONFIG_FILE}`);
    console.log(`\n${t("daemon.useStop")}`);
    console.log(`${t("daemon.useStatus")}`);
    return { success: true, pid: parseInt(pid, 10) };
  } else {
    console.log(`${t("daemon.startFailed")}`);
    return { success: false, reason: "timeout" };
  }
}

/**
 * 停止守护进程
 */
export async function stopDaemon(repoRoot, options = {}) {
  const locale = options.locale || null;
  const { t } = createTranslator(locale);

  const status = isDaemonRunning(repoRoot);

  if (!status.running) {
    console.log(`\n${t("daemon.notRunning")}`);
    return { success: false, reason: "not_running" };
  }

  console.log(`\n${t("daemon.stopping")}`);
  console.log(`  PID: ${status.pid}`);

  try {
    if (process.platform === "win32") {
      // 先尝试 taskkill /T（终止进程树，给 SIGTERM handler 机会）
      spawnSync("taskkill", ["/PID", status.pid.toString(), "/T"], {
        encoding: "utf8",
        timeout: 5000
      });
      // 等待进程退出
      const { setTimeout: delay } = await import("node:timers/promises");
      await delay(1000);
      // 如果还活着，强制终止
      if (isDaemonRunning(repoRoot).running) {
        spawnSync("taskkill", ["/PID", status.pid.toString(), "/F", "/T"], {
          encoding: "utf8",
          timeout: 5000
        });
      }
    } else {
      process.kill(status.pid, "SIGTERM");
    }

    // 清理文件
    const pidFile = path.join(repoRoot, DAEMON_PID_FILE);
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }

    console.log(`\n${t("daemon.stopped")}`);
    return { success: true };
  } catch (error) {
    console.log(`\n${t("daemon.stopFailed")}: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

/**
 * 显示守护进程状态
 */
export function showDaemonStatus(repoRoot, options = {}) {
  const locale = options.locale || null;
  const { t } = createTranslator(locale);

  const status = isDaemonRunning(repoRoot);
  const config = getDaemonConfig(repoRoot);

  console.log(`\n${t("daemon.status")}\n`);

  if (status.running) {
    console.log(`  ${t("daemon.state")}: ${t("daemon.running")}`);
    console.log(`  PID: ${status.pid}`);
    console.log(`  ${t("daemon.startTime")}: ${status.startTime || "unknown"}`);
    console.log(`  ${t("daemon.checksRun")}: ${status.checksRun}`);
    console.log(`  ${t("daemon.lastCheck")}: ${status.lastCheck || "never"}`);
  } else {
    console.log(`  ${t("daemon.state")}: ${t("daemon.stopped")}`);
  }

  console.log(`\n  ${t("daemon.config")}:`);
  console.log(`    ${t("daemon.watchPaths")}: ${config.watchPaths.join(", ")}`);
  console.log(`    ${t("daemon.checkInterval")}: ${config.checkInterval}ms`);
  console.log(`    ${t("daemon.blockOnHighRisk")}: ${config.blockOnHighRisk ? "yes" : "no"}`);

  console.log(`\n  ${t("daemon.commands")}:`);
  if (status.running) {
    console.log(`    agent-guardrails stop     - ${t("daemon.stopDesc")}`);
  } else {
    console.log(`    agent-guardrails start   - ${t("daemon.startDesc")}`);
  }
  console.log(`    agent-guardrails status  - ${t("daemon.statusDesc")}`);

  return status;
}
