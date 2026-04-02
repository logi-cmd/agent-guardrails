# 技术博客选题 — agent-guardrails

## 选题 1（首发）

### 标题：为什么你的 AGENTS.md 被 AI 忽略了（以及真正的解决方案）

**平台**：Dev.to + 掘金 + HackerNews

**大纲**：
1. **问题**：你写了 20 条规则，AI 根本不看
2. **原因**：AGENTS.md 只是"文件内容"，不是系统指令。AI 读取优先级是：
   - 系统级文件（CLAUDE.md）= ⭐⭐⭐ 必读
   - AGENTS.md = ⭐⭐ 可能跳过
   - 用户提示 = ⭐ 看心情
3. **解决方案**：三层防护
   - L1: enforce（注入系统级文件）
   - L2: AGENTS.md（项目规则）
   - L3: git hook（兜底拦截）
4. **代码演示**：`agent-guardrails enforce --all` 一行命令搞定
5. **Before/After**：对比 AI 在有 enforce 和没有 enforce 时的行为差异

**CTA**：npm install -g agent-guardrails

---

## 选题 2

### 标题：3 秒判断：这次 AI 改动可以安全 merge 吗？

**平台**：Dev.to + 掘金

**大纲**：
1. **场景**：AI 改完代码，你看着 47 个文件不知道怎么办
2. **问题**：AI 改了太多、改了不该改的、没跑测试
3. **检查清单**：`agent-guardrails check --base-ref HEAD~1`
4. **结果解读**：哪些是 blocker，哪些是 warning
5. **真实案例**：展示 AI 真实改动的 check 结果

---

## 选题 3

### 标题：我用 AI Agent 写了 3 个月代码，学到的 5 个教训

**平台**：掘金 + 知乎

**大纲**：
1. **教训 1**：AI 不会自动跑测试（它说"应该通过"≠它跑了）
2. **教训 2**：AI 会创建并行抽象（你有 utils.ts，它建了个 helpers.ts）
3. **教训 3**：写规则没用，要注入系统级文件
4. **教训 4**：事前约束比事后 review 高效 10 倍
5. **教训 5**：CI hook 是最后一道防线

---

## 选题 4

### 标题：Claude Code / Cursor 用户必装的 5 个 CLI 工具

**平台**：Dev.to + 掘金

**大纲**：（不直接推广，自然提及）
1. agent-guardrails — AI 代码合并门
2. （其他 4 个工具，填空）
3. 每个工具配 3 句话介绍 + 安装命令

---

## 选题 5（英文）

### 标题：Your AI Agent Just Changed 47 Files. Here's How to Stop It.

**平台**：Dev.to + HackerNews + Reddit r/ClaudeAI

**大纲**：英文版选题 2
