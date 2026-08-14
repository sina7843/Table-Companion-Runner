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

---

## TC-01 — Design-system integration

**Decision: vendor the approved CSS verbatim; add typed React adapters over it. No rewrite.**

The approved design system is already a complete, self-contained CSS implementation — ten token
files, seven component files and a skin, exposing a `tc-*` class API driven entirely by custom
properties, `[data-theme]` and `[data-density]`. Re-expressing that in CSS Modules, styled
components or Tailwind utilities would be a translation step whose only possible outcomes are
"identical" or "drifted". So the CSS is copied byte-for-byte into `src/design-system/`, mirroring
the source folder layout so `styles.css` and its relative `@import`s are unchanged, and every
React component is a thin adapter that adds types, accessibility wiring and state — never a
visual decision.

Consequences:
- **`.prettierignore` covers the vendored CSS.** Formatting it would destroy the ability to diff
  against the design source on re-import. Prettier ran over it once before this rule landed, so
  the current files differ from source in whitespace and quote style only; the compiled bundle was
  verified to retain all 3 container queries, 5 media queries, 14 keyframes, 16 `color-mix()`
  calls and both theme blocks.
- **`components/adapters.css` is the only new CSS**, and it is structural only: user-agent
  `<dialog>` resets, the tooltip anchor's positioning context, a visually-hidden helper, and
  restoring `cursor:pointer` on a clickable `.tc-chip--static`. It introduces no colour, type,
  spacing or shape. Anything visual belongs in the design system instead.

**Modal and Drawer are built on native `<dialog>`.** `showModal()` supplies the focus trap, the
inert background, Escape handling and top-layer stacking. Hand-rolling those is the single most
common source of broken overlay accessibility, and the platform version is both smaller and more
correct. The design's `.tc-scrim` moves onto `::backdrop`.

**No Tailwind, confirmed by contact with the source.** TC-00 chose this on inspection; building
against the CSS confirmed it. The system's contrast contract is expressed as paired tokens
(`--color-danger` for fills, `--color-danger-text` for text, `--color-text-on-*` for text on a
fill), and utility classes would invite picking the wrong half of a pair.

**`hpBand()` thresholds are a documented assumption.** The design defines four hit-point band
colours but never states the split. `critical ≤ 25%`, `damaged ≤ 50%` is inferred from the
design's own sample data, where 12/41 (29%) is labelled "Bloodied" — a warning tone, so critical
must sit below it. It lives in one function with a `ponytail:` marker and a test pinning the
boundaries; TC-03's rules engine should own it properly.

**Showcase route.** `src/showcase/Showcase.tsx` renders every primitive with live theme and
density switches. It earns its place: TC-15 is a design-fidelity audit, and this is the surface
that audit runs against. TC-02 moves it behind a dev-only route when real screens and routing
arrive.
