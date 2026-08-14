# Table Companion — Claude Code instructions

## Source precedence
1. `IMPLEMENTATION_DECISIONS.md`
2. `Requirements.md`
3. `DESIGN_SOURCE.md` and the approved Claude Design files accessed through `claude_design` MCP
4. The currently active file under `prompts/`
5. Existing repository conventions
6. A small documented assumption when none of the above resolves the issue

## Working rules
- Work on one `TC-*` prompt or one named slice at a time.
- Before implementation, confirm the repository has at least one Git commit. Stop if `git rev-list --all --count` is zero.
- Inspect before changing architecture, dependencies, or folder structure.
- Treat the approved Claude Design as implementation source material, not inspiration. Match hierarchy, spacing, density, states, and responsive intent closely.
- Use the `claude_design` MCP whenever a prompt requires visual/source verification. If MCP authentication is missing, ask the user to run `/design-login`, then continue in the same session.
- The product core must remain game-system agnostic. Never scatter D&D-specific rules through generic UI/state layers.
- Implement the smallest coherent end-to-end change for the active prompt.
- Do not create signed state, automatic retry loops, Stop hooks, or custom verifier engines.
- Delegate only when a clearly separate frontend, backend, review, or release task benefits from it.
- Run checks relevant to changed scope. Never claim a check passed unless it actually ran.
- Do not read or create real secret files. Use `.env.example` and documented names; ask the user to run `06-CREATE-LOCAL-ENV.cmd` when local secrets are needed.
- Treat `Requirements.md`, `IMPLEMENTATION_DECISIONS.md`, `DESIGN_SOURCE.md`, `CLAUDE.md`, `.claude/`, `tools/`, and `prompts/` as protected source material. Read them; do not rewrite them during product implementation.
- Do not wholesale recreate files when a targeted edit is safer.
- Preserve accessibility, keyboard behavior, touch targets, and responsive behavior.
- Use realistic tabletop content, not lorem ipsum.
- Update implementation status/decisions/traceability only when materially affected.

## Completion format for every prompt
Report:
- implemented behavior;
- important changed files;
- commands/tests actually run;
- visual fidelity checks performed;
- unresolved blockers/risks;
- next eligible prompt or slice.
