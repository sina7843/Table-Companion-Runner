# Simplified Claude web-app team — Windows native

This project configuration avoids automatic completion loops and fixed verification engines.

## Included
- Five agents: orchestrator, frontend, backend, test reviewer, and DevOps/release.
- Two lightweight project hooks for Bash and PowerShell:
  - `validate-command.mjs` blocks secret exposure, remote-script piping, and clearly destructive commands.
  - `protect-files.mjs` blocks secret paths, path escapes, and writes to Git metadata.
- One read-only command gate used only by `test-reviewer`.

## Deliberately absent
- Signed state, HMAC keys, Stop/TaskCompleted/ConfigChange hooks, automatic retries, iteration budgets, task prefixes, and custom verifier engines.
- Native Windows sandbox configuration, because native Windows Claude Code does not provide the Linux sandbox.

Run `node .claude/tests/guardrails.test.mjs` to validate the configuration.
