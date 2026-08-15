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

Run `npm run dev` and open http://localhost:5173/dev/showcase to see every primitive, with live
theme and density switches. That page is the fidelity-check surface for TC-15.

## Application shell

Two shells, because the design specifies two compositions rather than one responsive layout:

| Route | Shell | Notes |
| --- | --- | --- |
| `/`, `/join`, `/campaigns/new` | none | Entry screens, centred card |
| `/dm/*` | `DMShell` | Sidebar, top bar, workspace, context column |
| `/play/*` | `PlayerShell` | Header, content, bottom nav, touch density |
| `/dev/showcase` | none | Design-system fidelity surface |

Resize past 1280px to see the DM shell pivot: the sidebar collapses to its 56px icon rail,
density steps from `compact` to `comfortable`, and the context panel leaves the layout flow to
become a non-modal drawer with the workspace reserving its width.

To open the contextual right-side panel from any DM screen:

```tsx
const { show } = useContextPanel();
show({ eyebrow: 'Monster', title: 'Bugbear Chief', body: <StatBlock /> });
```

The screen does not know whether the panel renders docked or as a drawer — that is the shell's
job. `/dm/monsters` is a working example.

## Domain layer

The product is game-system agnostic. Two rules keep it that way, and both are enforced by tests
in [src/domain/domain.test.ts](src/domain/domain.test.ts):

1. **`src/domain/types.ts` names no D&D concept.** No armour class, no ability scores, no spell
   slots. Those reach the UI as `Attribute`, `DerivedValue` and `ResourcePool`, plus an opaque
   `systemData` bag the core never reads.
2. **Only `ruleset/registry.ts` imports a concrete adapter.** Everything else calls
   `requireRuleset(systemId)` and talks to the `Ruleset` interface.

```tsx
// Reading data
const { monsters } = useRepositories();
const state = useAsync(() => monsters.list(), ['monsters']);

// Asking the rules a question
const derived = requireRuleset(character.systemId).deriveCharacter(character);
const slots = requireRuleset(character.systemId).spellSlots(character); // null if no magic
```

Where a system might not support something, the ruleset declines rather than the UI guessing —
`spellSlots()` and `deathSaveOutcome()` return `null`, and `RulesetCapabilities` answers before a
screen renders anything.

If you need a D&D value outside `ruleset/dnd5e`, that is the signal to widen the `Ruleset`
interface, not to import across the boundary. The test will fail if you do.

Data comes from fixtures today ([src/domain/data/fixtures.ts](src/domain/data/fixtures.ts)) —
the design's own party, fight and monsters. Every repository method is already async, so TC-13
can swap in a real API without changing a caller.

### Seeing the empty, loading and error states

The screens have to handle a first-time user, an empty account, a slow read and a failed one. A
branch nobody can reach is a branch nobody has checked, so append `?scenario=` to any route:

| Scenario | What it shows |
| --- | --- |
| *(none)* | The design's world — live fight, four characters, two campaigns |
| `?scenario=first-time` | No campaigns, no characters. Onboarding on both homes |
| `?scenario=empty` | Campaigns exist, contents stripped |
| `?scenario=loading` | Reads never resolve; skeletons stay up |
| `?scenario=error` | Every read rejects; the recoverable error path renders |

For example: http://localhost:5173/dm?scenario=first-time. These are the real code paths, not
mock screens.

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
  App.tsx               Mounts the router
  app/
    routes.tsx          The Phase 1 route graph
    DMShell.tsx         DM sidebar shell + DMPage chrome + RouteLoading
    PlayerShell.tsx     Player bottom-nav shell + PlayerPage chrome
    ContextPanel.tsx    Docked panel / non-modal drawer, one component
    panelContext.tsx    useContextPanel() — every screen shares one panel
    nav.ts              Navigation model from the design's IA
    useMediaQuery.ts    Drives the density and sidebar-collapse attributes
    shell.css           Shell layout; tokens only, no new visual values
  screens/
    DMHome.tsx          DM home — live combat band, work columns, recall
    PlayerHome.tsx      Player home — the fight, the character, one offer
    entry.tsx           Sign in, join by invite, create a campaign
    campaign/           Campaign list, overview, party, encounters, combats, settings
    builder/            The guided character builder (generic shell + field renderers)
    index.tsx           Route skeletons for the screens not yet built
  domain/
    types.ts            Core entities — names no D&D concept
    permissions.ts      Visibility rules (a UI guard, not a security boundary)
    ruleset/            The game-system seam; dnd5e is the first adapter
    data/               Repository interfaces, fixtures, useRepositories()
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
