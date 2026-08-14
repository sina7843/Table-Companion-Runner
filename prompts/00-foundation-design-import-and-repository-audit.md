# TC-00 — Foundation Design Import And Repository Audit

```text
You are executing TC-00 for Table Companion.

Goal: establish a safe implementation foundation and verify the approved design source before product work.

Required sources: CLAUDE.md, IMPLEMENTATION_DECISIONS.md, Requirements.md, DESIGN_SOURCE.md, PROJECT_STATUS.md.

Tasks:
1. Confirm `git rev-list --all --count` is at least 1. Stop if not.
2. Inspect the repository thoroughly before modifying anything. Determine whether it is greenfield or already contains an application.
3. Verify `claude_design` MCP is available. Import the project URL in DESIGN_SOURCE.md and read `Table Companion Phase 1 - Part 4.dc.html` plus every listed design-system import and `support.js`. If authentication is missing, stop implementation and tell the user to run `/design-login`; after login, resume this same prompt.
4. Build a concise implementation map from the design source: routes/screens, shared shell, responsive breakpoints, recurring components, domain-specific components, overlays/panels, and key interactive states.
5. Decide whether to preserve the existing stack or scaffold a modern React/TypeScript app. For a greenfield repo, default to Next.js + React + TypeScript + Tailwind unless the imported design or environment strongly favors a simpler React/Vite architecture. Document the choice in DECISIONS.md.
6. Create only the minimum project scaffolding needed to make the app boot, including package scripts, TypeScript config, linting, formatting, and `.env.example` if required. Do not add real secrets.
7. Add an implementation-facing README section or developer note explaining how to run the app locally.
8. Do not implement feature screens yet beyond a neutral boot shell.

Acceptance:
- repository has a recoverable baseline;
- approved design source was actually inspected through MCP;
- selected stack is documented;
- app boots locally;
- lint/typecheck/build baseline commands are known and run where practical;
- no real `.env` is read or created.

At the end, update TC-00 in PROJECT_STATUS.md only if all acceptance criteria are satisfied, and commit with a clear message such as `chore: complete TC-00 foundation`.
```
