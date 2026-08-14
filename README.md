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
| `npm run test`         | Node's built-in test runner over `src/**/*.test.ts` |
| `npm run lint`         | oxlint over `src`                                |
| `npm run format`       | Prettier write                                   |
| `npm run format:check` | Prettier check, no writes                        |

Run `npm run typecheck`, `npm run test`, `npm run lint` and `npm run build` before committing.

## Using the design system

The approved design system lives in [src/design-system/](src/design-system/). Import the
stylesheet once — `src/main.tsx` already does — then use the typed components:

```tsx
import { Button, HPBar, Badge } from './design-system';

<Button variant="primary" icon="broadcast">Return to combat</Button>
<HPBar current={47} max={58} showUnit />
<Badge tone="warning" icon="drop">Bloodied</Badge>
```

Two rules keep this from drifting:

1. **The CSS under `tokens/`, `components/css/` and `skins/` is a verbatim copy of the approved
   Claude Design source.** It is the visual contract. Do not edit it to suit a screen, and do not
   let Prettier reformat it — `.prettierignore` covers it so it stays diffable against the source.
2. **React components are adapters, not designers.** They add types, ARIA wiring and state. If you
   are about to write a colour, font size, spacing value or radius in a `.tsx` file, the answer is
   a design-system token or a missing design-system component.

Theme and density are data attributes on any ancestor, and compose independently:

```tsx
<div className="tc-appsurface" data-theme="dark" data-density="compact">
```

`data-theme` is `dark` (default) or `light`. `data-density` is `comfortable` (default), `compact`
for the DM's combat surfaces, or `touch` for mobile — which also activates the 44px touch-target
floor. Put `tc-appsurface` on whatever element paints the full-height background, or the
Digital Grimoire paper texture is hidden behind it.

Run `npm run dev` and open http://localhost:5173 to see every primitive in the showcase, with
live theme and density switches. That page is the fidelity-check surface for TC-15.

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
  main.tsx              React entry point; imports the design system once
  App.tsx               Renders the showcase until TC-02 brings the real app shell
  design-system/
    styles.css          Verbatim import barrel from the approved design source
    tokens/*.css        Verbatim — colour, type, spacing, shape, motion, layout
    components/css/*    Verbatim — controls, nav, data, feedback, overlays, combat
    skins/*.css         Verbatim — Digital Grimoire
    components/*.tsx    Typed React adapters over the tc-* classes
    components/adapters.css  Structural only — <dialog> resets, tooltip anchor
    index.ts            Public surface
  showcase/Showcase.tsx Fidelity-check surface for every primitive
```

## Build order

Work proceeds one `TC-*` prompt at a time from `prompts/`, tracked in `PROJECT_STATUS.md`.
TC-00 establishes this foundation; TC-01 integrates the design system; TC-02 builds the app shell
and navigation.
