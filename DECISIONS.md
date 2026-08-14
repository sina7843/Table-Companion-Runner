# Table Companion — Runtime implementation decisions

Append implementation-specific decisions here only when the active prompt requires one.

---

## TC-00 — Stack selection

**Decision: React 19 + TypeScript + Vite. No Next.js. No Tailwind.**

`IMPLEMENTATION_DECISIONS.md` #16 sets the greenfield default to Next.js + Tailwind, but makes
that default conditional ("when appropriate") and #17 requires any stack choice to serve fidelity,
maintainability or implementation speed. The imported design and the requirements both point to
the simpler React/Vite architecture the TC-00 prompt names as the alternative. Reasons, in order
of weight:

1. **The approved design system is plain token CSS, not utility classes.** The imported
   `styles.css` composes ten `tokens/*.css` files, seven `components/css/*.css` files and
   `skins/digital-grimoire.css` into a `tc-*` class layer driven entirely by CSS custom
   properties, `[data-theme]` and `[data-density]`. Adding Tailwind would put a second,
   competing styling system beside a complete one and invite drift from the approved source.
   The design system is consumed as-is; Tailwind is omitted deliberately, not skipped.
2. **No server rendering surface to gain.** Phase 1 is an authenticated, realtime session tool.
   `Requirements.md` §15 fixes it as online-first with autosave, reconnect and recovery from last
   valid server state. Live Combat is websocket-driven and behind a login, so there is no SEO
   surface and no meaningful first-paint win from SSR or RSC — only added server runtime and
   app-router complexity around an application that is a client-side realtime SPA.
3. **Nothing in the requirements mandates a framework or a server.** `Requirements.md` names no
   stack, host or backend. §5 asks only for "responsive web support". Committing to the Next.js
   server model now would decide the backend shape before TC-13 (`data access, realtime and
   persistence seams`) has defined it.
4. **Faster feedback for a fidelity-driven build.** Prompts TC-01 through TC-15 are judged on
   visual fidelity against the design canvas. Vite's dev server and HMR keep that loop tight.

**Consequences and what stays open**
- A backend is not chosen here. TC-13 defines the data-access and realtime seams; this decision
  does not block Next.js route handlers, a separate API service, or a BaaS being adopted then.
- Routing and state libraries are deliberately not installed yet. They arrive with TC-02
  (app shell and navigation) and TC-03 (domain model and state foundation), so the choice is made
  against real screens rather than speculatively.
- If Phase 2 or 3 introduces a genuine SSR or SEO requirement (a public campaign wiki, shared
  read-only links), migrating a Vite React app to Next.js is a contained change; the reverse —
  unwinding an unused server framework — is not.

**Linting: oxlint rather than ESLint.** The approved design system ships
`_ds/.../_adherence.oxlintrc.json`, a 55 KB rule set for enforcing design-system adherence. Using
oxlint now means TC-01 can point at that file directly instead of translating it. `tsc --noEmit`
covers type-aware checking, so the pair gives full coverage with one lint dependency instead of
four. Swap in ESLint if the design-adherence config turns out unusable in TC-01.

**Prettier scope.** `.prettierignore` excludes all markdown. No markdown in this repository is
application source, and `Requirements.md`, `IMPLEMENTATION_DECISIONS.md`, `DESIGN_SOURCE.md` and
`CLAUDE.md` are protected project source that tooling must not rewrite.
