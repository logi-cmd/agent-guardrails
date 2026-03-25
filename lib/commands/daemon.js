/**
 * Agent Guardrails Daemon Mode
 *
 * 自动守护模式 - 后台运行，自动检查 AI 改动
 *
 * Usage:
 *   agent-guardrails start [--foreground]   - 启动守护模式 (--foreground 前台运行)
 *   agent-guardrails stop                   - 停止守护模式
 *   agent-guardrails status                 - 查看状态
 */

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createTranslator } from "../i18n.js";
import { readConfig, readTextIfExists } from "../utils.js";

const DAEMON_PID_FILE = ".agent-guardrails/daemon.pid";
const DAEMON_LOG_FILE = ".agent-guardrails/daemon.log";
const DAEMON_CONFIG_FILE = ".agent-guardrails/daemon.json";

/**
 * 默认守护配置
 */
const DEFAULT_DAEMON_CONFIG = {
  enabled: true,
  watchPaths: ["src/", "lib/", "tests/"],
  ignorePatterns: ["node_modules", ".git", "dist", "coverage"],
  autoCheckOn: ["file-change", "git-stage"],
  checkInterval: 5000, // 5秒防抖
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

    // 检查进程是否存在
    if (Number.isNaN(pid)) {
      return { running: false };
    }

    // 跨平台检查进程
    let isRunning = false;
    try {
      if (process.platform === "win32") {
        const result = spawnSync("tasklist", ["/FI", `PID eq ${pid}`], {
          encoding: "utf8",
          timeout: 5000
        });
        isRunning = result.stdout.includes(pid.toString());
      } else {
        process.kill(pid, 0);
        isRunning = true;
      }
    } catch {
      isRunning = false;
    }

    if (!isRunning) {
      // 清理过期的 PID 文件
      fs.unlinkSync(pidFile);
      return { running: false };
    }

    // 读取守护进程信息
    const infoFile = path.join(repoRoot, ".agent-guardrails/daemon-info.json");
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

  // 前台模式
  if (foreground) {
    return runForegroundDaemon(repoRoot, config, { locale });
  }

  console.log(`\n${t("daemon.starting")}\n`);

  // 启动守护进程
  const daemonScript = `
    const fs = require('fs');
    const path = require('path');
    const { spawn } = require('child_process');

    const repoRoot = ${JSON.stringify(repoRoot)};
    const config = ${JSON.stringify(config)};
    const pidFile = path.join(repoRoot, ${JSON.stringify(DAEMON_PID_FILE)});
    const logFile = path.join(repoRoot, ${JSON.stringify(DAEMON_LOG_FILE)});
    const infoFile = path.join(repoRoot, '.agent-guardrails/daemon-info.json');

    let checksRun = 0;
    let lastCheck = null;
    let checkTimeout = null;

    function log(message) {
      const timestamp = new Date().toISOString();
      const line = \`[\${timestamp}] \${message}\\n\`;
      fs.appendFileSync(logFile, line);
      console.log(line.trim());
    }

    function updateInfo() {
      fs.writeFileSync(infoFile, JSON.stringify({
        pid: process.pid,
        startTime: new Date().toISOString(),
        checksRun,
        lastCheck
      }, null, 2));
    }

    function runCheck() {
      log('Running guardrail check...');
      checksRun++;
      lastCheck = new Date().toISOString();
      updateInfo();

      const child = spawn('npx', ['agent-guardrails', 'check', '--json'], {
        cwd: repoRoot,
        shell: true,
        stdio: 'pipe'
      });

      let output = '';
      child.stdout.on('data', (data) => output += data);
      child.stderr.on('data', (data) => output += data);

      child.on('close', (code) => {
        if (code !== 0) {
          log(\`Check failed with code \${code}\`);
          // 可以在这里添加通知逻辑
        } else {
          log('Check passed');
        }
      });
    }

    function scheduleCheck() {
      if (checkTimeout) clearTimeout(checkTimeout);
      checkTimeout = setTimeout(runCheck, config.checkInterval);
    }

    // 写入 PID
    fs.writeFileSync(pidFile, process.pid.toString());
    log(\`Daemon started with PID \${process.pid}\`);
    updateInfo();

    // 监听文件变化（如果启用且 chokidar 可用）
    if (config.autoCheckOn.includes('file-change')) {
      try {
        const chokidar = require('chokidar');
        const watcher = chokidar.watch(config.watchPaths, {
          ignored: config.ignorePatterns,
          persistent: true,
          ignoreInitial: true
        });

        watcher.on('change', (filePath) => {
          log(\`File changed: \${filePath}\`);
          scheduleCheck();
        });

        watcher.on('add', (filePath) => {
          log(\`File added: \${filePath}\`);
          scheduleCheck();
        });

        log('File watcher initialized');
      } catch (e) {
        log('chokidar not available, file watching disabled: ' + e.message);
      }
    }

    // 保持进程运行
    process.on('SIGTERM', () => {
      log('Received SIGTERM, shutting down...');
      fs.unlinkSync(pidFile);
      process.exit(0);
    });

    process.on('SIGINT', () => {
      log('Received SIGINT, shutting down...');
      fs.unlinkSync(pidFile);
      process.exit(0);
    });

    // 心跳
    setInterval(() => {
      updateInfo();
    }, 60000);
  `;

  // 使用 node 启动守护进程
  const child = spawn(process.execPath, ["-e", daemonScript], {
    detached: true,
    stdio: "ignore",
    cwd: repoRoot
  });

  child.unref();

  // 等待 PID 文件创建
  const pidFile = path.join(repoRoot, DAEMON_PID_FILE);
  let attempts = 0;
  while (!fs.existsSync(pidFile) && attempts < 50) {
    await new Promise((r) => setTimeout(r, 100));
    attempts++;
  }

  if (fs.existsSync(pidFile)) {
    const pid = fs.readFileSync(pidFile, "utf8").trim();
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
export function stopDaemon(repoRoot, options = {}) {
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
      spawnSync("taskkill", ["/PID", status.pid.toString(), "/F"], {
        encoding: "utf8",
        timeout: 5000
      });
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
    console.log(`  ${t("daemon.state")}: ✅ ${t("daemon.running")}`);
    console.log(`  PID: ${status.pid}`);
    console.log(`  ${t("daemon.startTime")}: ${status.startTime || "unknown"}`);
    console.log(`  ${t("daemon.checksRun")}: ${status.checksRun}`);
    console.log(`  ${t("daemon.lastCheck")}: ${status.lastCheck || "never"}`);
  } else {
    console.log(`  ${t("daemon.state")}: ⏹️ ${t("daemon.stopped")}`);
  }

  console.log(`\n  ${t("daemon.config")}:`);
  console.log(`    ${t("daemon.watchPaths")}: ${config.watchPaths.join(", ")}`);
  console.log(`    ${t("daemon.checkInterval")}: ${config.checkInterval}ms`);
  console.log(`    ${t("daemon.blockOnHighRisk")}: ${config.blockOnHighRisk ? "✅" : "❌"}`);

  console.log(`\n  ${t("daemon.commands")}:`);
  if (status.running) {
    console.log(`    agent-guardrails stop     - ${t("daemon.stopDesc")}`);
  } else {
    console.log(`    agent-guardrails start   - ${t("daemon.startDesc")}`);
  }
  console.log(`    agent-guardrails status  - ${t("daemon.statusDesc")}`);

  return status;
}

/**
 * 配置守护进程
 */
export function configureDaemon(repoRoot, options = {}) {
  const locale = options.locale || null;
  const { t } = createTranslator(locale);

  const config = getDaemonConfig(repoRoot);

  // 应用选项
  if (options.watchPaths) {
    config.watchPaths = options.watchPaths.split(",").map((p) => p.trim());
  }
  if (options.checkInterval) {
    config.checkInterval = parseInt(options.checkInterval, 10);
  }
  if (options.blockOnHighRisk !== undefined) {
    config.blockOnHighRisk = options.blockOnHighRisk;
  }

  writeDaemonConfig(repoRoot, config);

  console.log(`\n${t("daemon.configUpdated")}`);
  console.log(`  ${t("daemon.configFile")}: ${DAEMON_CONFIG_FILE}`);

  return config;
}

/**
 * 前台运行守护进程
 */
export async function runForegroundDaemon(repoRoot, config, options = {}) {
  const locale = options.locale || null;
  const { t } = createTranslator(locale);

  const pidFile = path.join(repoRoot, DAEMON_PID_FILE);
  const logFile = path.join(repoRoot, DAEMON_LOG_FILE);
  const infoFile = path.join(repoRoot, ".agent-guardrails/daemon-info.json");

  let checksRun = 0;
  let lastCheck = null;
  let checkTimeout = null;
  let watcher = null;

  // 日志函数 - 前台模式直接输出到控制台
  function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
  }

  // 更新状态信息
  function updateInfo() {
    const info = {
      pid: process.pid,
      startTime: startTime,
      checksRun,
      lastCheck,
      foreground: true
    };
    fs.writeFileSync(infoFile, JSON.stringify(info, null, 2));
  }

  // 运行检查
  function runCheck() {
    return new Promise((resolve) => {
      log("Running guardrail check...");
      checksRun++;
      lastCheck = new Date().toISOString();
      updateInfo();

      const child = spawn("npx", ["agent-guardrails", "check", "--json"], {
        cwd: repoRoot,
        shell: true,
        stdio: "pipe"
      });

      let output = "";
      child.stdout.on("data", (data) => (output += data));
      child.stderr.on("data", (data) => (output += data));

      child.on("close", (code) => {
        if (code !== 0) {
          log(`Check completed with issues (code ${code})`);
          // 解析结果并显示摘要
          try {
            const result = JSON.parse(output);
            if (result.findings && result.findings.length > 0) {
              log(`Found ${result.findings.length} issues`);
            }
          } catch {
            // 忽略解析错误
          }
        } else {
          log("Check passed");
        }
        resolve();
      });
    });
  }

  // 调度检查（防抖）
  function scheduleCheck() {
    if (checkTimeout) clearTimeout(checkTimeout);
    checkTimeout = setTimeout(runCheck, config.checkInterval);
  }

  // 清理函数
  function cleanup() {
    log("Shutting down...");
    if (checkTimeout) clearTimeout(checkTimeout);
    if (watcher) {
      watcher.close();
    }
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
    if (fs.existsSync(infoFile)) {
      fs.unlinkSync(infoFile);
    }
  }

  const startTime = new Date().toISOString();

  // 写入 PID
  fs.writeFileSync(pidFile, process.pid.toString());

  console.log(`\n${t("daemon.starting")} (${t("daemon.foregroundMode")})\n`);
  log(`Daemon started with PID ${process.pid}`);
  log(`Working directory: ${repoRoot}`);
  log(`Watch paths: ${config.watchPaths.join(", ")}`);
  log(`Check interval: ${config.checkInterval}ms`);
  log("Press Ctrl+C to stop\n");

  updateInfo();

  // 设置信号处理
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log(""); // 换行
    cleanup();
    process.exit(0);
  });

  // 文件监听
  if (config.autoCheckOn.includes("file-change")) {
    try {
      const chokidar = await import("chokidar");
      watcher = chokidar.watch(config.watchPaths, {
        cwd: repoRoot,
        ignored: config.ignorePatterns,
        persistent: true,
        ignoreInitial: true
      });

      watcher.on("change", (filePath) => {
        log(`File changed: ${filePath}`);
        scheduleCheck();
      });

      watcher.on("add", (filePath) => {
        log(`File added: ${filePath}`);
        scheduleCheck();
      });

      log("File watcher initialized");
    } catch (e) {
      log(`chokidar not available, file watching disabled: ${e.message}`);
    }
  }

  // 心跳更新
  setInterval(updateInfo, 60000);

  // 保持进程运行
  return new Promise(() => {
    // 永不 resolve，保持进程运行
  });
}
