# Agent Rules

## Read First

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. `README.md`
4. the files directly related to the current command or check you will modify

## Repo Intent

- This project should stay lightweight and convenient to adopt.
- Default behavior should be helpful without requiring deep configuration.
- Guardrail logic should be explainable and predictable before it is clever.

## Implementation Rules

- Prefer small, composable checks over a large opaque engine.
- Do not claim stronger enforcement than the code actually provides.
- Keep the CLI zero-dependency unless a dependency clearly improves trust or usability.
- When adding new checks, document the false-positive tradeoff.

## Definition Of Done

- The repository shape and docs still reflect the actual product.
- New behavior includes tests or a clear note explaining why tests were deferred.
- Project state and next step stay accurate after meaningful work.
<!-- agent-guardrails:daemon:start -->
## Daemon Mode / 守护模式

Daemon 正在运行。每次修改文件后，请调用 `read_daemon_status` MCP 工具检查 guardrail 结果。如果有 error 级别的 finding，在继续之前先修复。
<!-- agent-guardrails:daemon:end -->
