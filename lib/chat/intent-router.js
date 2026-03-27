/**
 * Intent router — maps natural-language user messages to the appropriate
 * MCP tool name and arguments.
 *
 * This is a lightweight keyword-based router.  It does NOT call any LLM
 * and does NOT require network access.  The goal is to let users talk to
 * agent-guardrails in plain language from a chat tool or desktop app.
 */

// ---- intent rules (ordered by specificity, first match wins) ----

const INTENT_RULES = [
  {
    id: "start_loop",
    // zh
    zh: [/开始做/, /开始任务/, /启动循环/, /开始工作/, /做这个任务/, /开始实现/],
    // en
    en: [/start\s+(the\s+)?(task|loop|work|implement)/, /^let'?s\s+start/, /^begin\b/],
    tool: "start_agent_native_loop",
    extractArgs(message) {
      // everything after the trigger phrase is the task description
      const cleaned = message.replace(/开始做|开始任务|启动循环|开始工作|做这个任务|开始实现/i, "").trim();
      const enCleaned = message.replace(/start\s+(?:the\s+)?(?:task|loop|work|implement)\s*:?\s*/i, "").trim();
      const task = cleaned || enCleaned;
      return task ? { taskRequest: task } : {};
    }
  },
  {
    id: "finish_loop",
    zh: [/做完了/, /完成了/, /结束循环/, /结束任务/, /finish/],
    en: [/^(done|finished|complete|finish)\b/, /^i'?m\s+done/i],
    tool: "finish_agent_native_loop",
    extractArgs() {
      return {};
    }
  },
  {
    id: "run_check",
    zh: [/检查/, /check/, /审查/, /校验/, /看看改动/, /检查一下/],
    en: [/^(check|verify|review|inspect)\b/, /run\s+(a\s+)?check/, /guardrail\s*check/],
    tool: "run_guardrail_check",
    extractArgs() {
      return { review: true };
    }
  },
  {
    id: "summarize_risks",
    zh: [/风险/, /总结/, /概要/, /summary/, /有什么风险/],
    en: [/^(risk|summary|summarize|risks)\b/, /what(?:'s| is)\s+the\s+risk/, /give me a summary/],
    tool: "summarize_review_risks",
    extractArgs() {
      return {};
    }
  },
  {
    id: "plan_rough",
    zh: [/规划/, /计划/, /plan/, /帮我规划/, /怎么改/, /建议/],
    en: [/^plan\b/, /^(how|what)\s+should\s+i\b/, /^suggest\b/, /give me a plan/],
    tool: "plan_rough_intent",
    extractArgs(message) {
      const cleaned = message.replace(/帮我规划|怎么改|建议/i, "").trim();
      const enCleaned = message.replace(/^(plan|suggest|how should i)\s*:?\s*/i, "").trim();
      const task = cleaned || enCleaned;
      return task ? { task } : {};
    }
  },
  {
    id: "explain_change_rule",
    // zh
    zh: [/解释/, /解释一下/, /解释一下/, /说说改动/, /说说变化/, /改了什么/, /为什么改/],
    // en
    en: [/^explain\b/, /explain change/, /what changed/, /why changed/, /tell me about/, /describe change/],
    tool: "explain_change",
    extractArgs: (msg) => ({})
  },
  {
    id: "query_archaeology_rule",
    // zh
    zh: [/查询/, /变更历史/, /考古/, /变更记录/, /历史/, /为什么这样写/],
    // en
    en: [/^query\b/, /archaeology/, /change history/, /why this way/, /history/],
    tool: "query_archaeology",
    extractArgs: (msg) => ({})
  },
  {
    id: "read_guardrails",
    zh: [/仓库规则/, /guardrails/, /规则/, /配置/, /repo rules/],
    en: [/^(rules|guardrails|config|repo)\b/, /read\s+(?:the\s+)?(?:repo|guardrails|rules)/, /show\s+(?:me\s+)?(?:the\s+)?(?:repo|guardrails|rules|config)/],
    tool: "read_repo_guardrails",
    extractArgs() {
      return {};
    }
  },
  {
    id: "daemon_status",
    zh: [/守护进程/, /daemon/, /监控状态/],
    en: [/^(daemon|watcher|monitor)\b/, /daemon\s+status/, /monitoring\s+status/],
    tool: "read_daemon_status",
    extractArgs() {
      return {};
    }
  },
  {
    id: "suggest_contract",
    zh: [/建议契约/, /任务契约/, /contract/],
    en: [/^(suggest|contract|brief)\b/, /suggest\s+(?:a\s+)?(?:task\s+)?contract/],
    tool: "suggest_task_contract",
    extractArgs(message) {
      const cleaned = message.replace(/建议契约|任务契约|suggest\s+(?:a\s+)?(?:task\s+)?contract/i, "").trim();
      return cleaned ? { taskRequest: cleaned } : {};
    }
  }
];

// ---- public API ----

/**
 * Route a user message to a tool name + extracted args.
 *
 * @param {string} message - raw user message
 * @returns {{ tool: string, args: object } | null}
 */
export function routeIntent(message) {
  if (!message || typeof message !== "string") {
    return null;
  }

  const normalized = message.trim();
  if (!normalized) {
    return null;
  }

  for (const rule of INTENT_RULES) {
    const matched =
      rule.zh.some((re) => re.test(normalized)) ||
      rule.en.some((re) => re.test(normalized));

    if (matched) {
      return {
        tool: rule.tool,
        args: rule.extractArgs(normalized)
      };
    }
  }

  // fallback: treat as rough intent planning
  return {
    tool: "plan_rough_intent",
    args: { task: normalized }
  };
}

/**
 * Return the list of known tool names (for help output).
 */
export function knownTools() {
  return [...new Set(INTENT_RULES.map((r) => r.tool))];
}
