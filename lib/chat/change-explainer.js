// Change explainer module for agent-guardrails
// Provides human-readable explanations of changes based on file paths and change types
// Includes lightweight archaeology note for quick traceability

// Optional translator loader for CommonJS environments. We load i18n.js only if running in a
// CommonJS environment and the module is available. In ES module environments, we fall back to a
// simple identity translator.
let _translator = null;
function getTranslator(locale) {
  if (_translator) return _translator;
  if (typeof require === "function") {
    try {
      const i18n = require("../i18n.js");
      if (i18n && typeof i18n.createTranslator === "function") {
        const t = i18n.createTranslator(locale);
        _translator = typeof t === "function" ? t : ((s) => s);
        return _translator;
      }
    } catch {
      // ignore and fall back to identity translator
    }
  }
  _translator = (s) => s;
  return _translator;
}

// Generate sentences explaining what changed for each file, in zh-CN or en depending on locale.
export function generateChangeExplanation({ changedFiles, taskContract, findings, locale }) {
  const isZhLocale = locale === "zh-CN" || locale === "zh" || (typeof locale === "string" && locale.toLowerCase().startsWith("zh"));
  // Guard for empty input
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return isZhLocale ? "未检测到变更。" : "No changes detected.";
  }

  const toZh = (type) => {
    switch (type) {
      case "added": return "新增";
      case "modified": return "修改";
      case "deleted": return "删除";
      default: return type;
    }
  };
  const toEn = (type) => {
    switch (type) {
      case "added": return "added";
      case "modified": return "modified";
      case "deleted": return "deleted";
      default: return type;
    }
  };

  const taskText = taskContract && taskContract.task ? taskContract.task : "";
  const sentences = changedFiles.map((cf) => {
    const path = cf && cf.path ? cf.path : "";
    const type = cf && cf.type ? cf.type : "";
    if (isZhLocale) {
      const label = toZh(type);
      return `文件 ${path} 已 ${label}。任务意图：${taskText}。`;
    } else {
      const label = toEn(type);
      return `Changed file: ${path} - ${label}. Task: ${taskText}`;
    }
  });
  // Join sentences with spaces for readability
  return sentences.join(" ");
}

// Archaeology helper: simple note containing task intent and involved files
export function generateArchaeologyNote({ changedFiles, taskContract, sessionId }) {
  const files = Array.isArray(changedFiles) ? changedFiles.map((f) => f.path).filter(Boolean) : [];
  const joined = files.length > 0 ? files.join(", ") : "";
  const taskText = taskContract && taskContract.task ? taskContract.task : "";
  const base = `变更原因：${taskText} | 涉及文件：${joined}${sessionId ? ` | 会话：${sessionId}` : ""}`;
  return base;
}

// CommonJS compatibility: allow require('./change-explainer.js') to work as well
if (typeof module !== "undefined" && module.exports) {
  module.exports = { generateChangeExplanation, generateArchaeologyNote };
}
