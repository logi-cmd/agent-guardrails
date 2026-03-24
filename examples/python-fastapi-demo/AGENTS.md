# Agent Rules

## Read First

Before writing code, read:

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. `README.md`
4. the specific files you plan to modify

## Working Style

- Prefer the canonical runtime flow: bounded task, required command, evidence update, `check --review`
- Keep FastAPI changes inside the declared scope
- Pair endpoint logic changes with the matching pytest-style validation file
- Keep observability, rollback, and residual risk explicit in the evidence note for production-shaped tasks

## Definition Of Done

- The implementation matches the current FastAPI-style repo layout.
- Required commands are reported to `check`.
- The evidence note reflects the real task result.
- Deploy-readiness and post-deploy maintenance output stay consistent with the task contract.
