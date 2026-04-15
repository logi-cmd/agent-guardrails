# agent-guardrails: ALWAYS run before finishing

Before telling the user a task is done, you MUST:

1. Run: `npx agent-guardrails check --base-ref HEAD~1`
2. If issues found → fix them first, do NOT say "done"
3. If clean → include the check result in your summary
4. If command not found → tell user to run `npx agent-guardrails setup`

This is not optional. Skipping this check means the task is incomplete.