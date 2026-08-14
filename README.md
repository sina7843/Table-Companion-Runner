# Table Companion

An operating system for your tabletop campaign. Phase 1 is the core play engine: campaigns,
characters, monsters, encounters and live combat, with a desktop/tablet-first DM experience and a
mobile-first Player experience.

This file is the implementation-facing developer note. Product scope lives in `Requirements.md`,
fixed decisions in `IMPLEMENTATION_DECISIONS.md`, the approved UI in `DESIGN_SOURCE.md`, and
per-prompt implementation choices in `DECISIONS.md`.

## Stack

| Concern    | Choice                        |
| ---------- | ----------------------------- |
| UI         | React 19                      |
| Language   | TypeScript (strict)           |
| Build      | Vite 7                        |
| Styling    | Approved design-system CSS    |
| Lint       | oxlint                        |
| Format     | Prettier                      |

Routing, state management and the data layer are intentionally not installed yet — they arrive
with TC-02, TC-03 and TC-13. See `DECISIONS.md` for why Next.js and Tailwind were not used.

## Requirements

- Node.js 20 or newer (developed against v24)
- npm 10 or newer

Windows users can run `01-INSTALL-TOOLS.cmd` to install prerequisites.

## Running locally

```bash
npm install
npm run dev
```

The dev server listens on http://localhost:5173.

## Scripts

| Script                 | What it does                                    |
| ---------------------- | ----------------------------------------------- |
| `npm run dev`          | Vite dev server with hot module replacement      |
| `npm run build`        | Typecheck, then build to `dist/`                 |
| `npm run preview`      | Serve the production build locally               |
| `npm run typecheck`    | `tsc --noEmit`                                   |
| `npm run lint`         | oxlint over `src`                                |
| `npm run format`       | Prettier write                                   |
| `npm run format:check` | Prettier check, no writes                        |

Run `npm run typecheck`, `npm run lint` and `npm run build` before committing.

## Environment

No environment variables are needed yet. `.env.example` documents the names as they are
introduced. Never create or commit a real `.env` by hand — run `06-CREATE-LOCAL-ENV.cmd` when
local secrets become necessary. Vite only exposes variables prefixed `VITE_` to client code, so
never put a secret behind that prefix.

## Design source

The approved Phase 1 UI is a Claude Design project, imported through the `claude_design` MCP
server configured in `.mcp.json`. `DESIGN_SOURCE.md` holds the project URL and the exact file
list. If MCP calls fail with a consent or authentication error, run `/design consent` (and
`/design-login` if needed) inside Claude Code, then retry.

The design system is a plain CSS token layer — `tokens/*.css`, `components/css/*.css` and
`skins/digital-grimoire.css` — exposing a `tc-*` class API driven by CSS custom properties.
Themes switch via `[data-theme="dark|light"]` and density via
`[data-density="comfortable|compact|touch"]`.

Breakpoints, mirrored literally in media queries:

| Token      | Width  | Use                                     |
| ---------- | ------ | --------------------------------------- |
| `--bp-sm`  | 480px  | large phone                             |
| `--bp-md`  | 768px  | small tablet                            |
| `--bp-lg`  | 1024px | tablet landscape / small laptop         |
| `--bp-xl`  | 1280px | DM desktop                              |
| `--bp-2xl` | 1600px | DM desktop, context panel + workspace   |

## Project layout

```
src/
  main.tsx    React entry point
  App.tsx     Neutral boot shell (replaced by the real app shell in TC-02)
  boot.css    Placeholder styling for the boot shell only — removed in TC-01
```

## Build order

Work proceeds one `TC-*` prompt at a time from `prompts/`, tracked in `PROJECT_STATUS.md`.
TC-00 establishes this foundation; TC-01 integrates the design system; TC-02 builds the app shell
and navigation.
