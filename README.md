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
| Routing    | react-router-dom 7            |
| Styling    | Approved design-system CSS    |
| Lint       | oxlint                        |
| Format     | Prettier                      |
| Tests      | `node --test` (no framework)  |

`react-router-dom` is the only runtime dependency beyond React itself. There is no state
library, no data-fetching library, no CSS framework and no test framework: state is React state
behind repository interfaces, and the test harness is Node's own runner over TypeScript with
native type stripping. See `DECISIONS.md` for why Next.js and Tailwind were not used.

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
| `/builder`, `/builder/:draftId` | none | Guided character builder — whole viewport |
| `/play/sheet/:id` and its sub-flows | none | Sheet, edit, privacy, level up — whole viewport |
| `/dm/*` | `DMShell` | Sidebar, top bar, workspace, context column |
| `/play/*` | `PlayerShell` | Header, content, bottom nav, touch density |
| `/dev/showcase` | none | Design-system fidelity surface |

Every route module is `React.lazy`, so a player opening `/play/combat` on a phone does not
download the monster library or the encounter builder. The shells stay eager — a frame that
flashes is worse than a frame that costs a few kilobytes.

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

### The two seams

**Data.** Every screen reads through the repository interfaces in
[src/domain/data/repositories.ts](src/domain/data/repositories.ts). Two implementations satisfy
them and [dataSource.ts](src/domain/data/dataSource.ts) picks one from the environment:

| `VITE_API_BASE_URL` | Implementation | Notes |
| --- | --- | --- |
| unset | `createFixtureRepositories` | In-memory; the design's own party, fight and monsters |
| set | `createHttpRepositories` | Every route and verb is declared in [apiContract.ts](src/domain/data/apiContract.ts) |

The write policy is documented at the top of `repositories.ts`: every write is idempotent,
autosave is owned by the screen, optimism is allowed where local state is authoritative and
refused where the server mints an id (`create`, `duplicate`, `cloneFrom`, `startFromTemplate`).
Nothing in the data layer caches or retries.

**Realtime.** [realtime.ts](src/domain/data/realtime.ts) defines one `RealtimeChannel` with three
implementations, selected by `VITE_REALTIME_URL`:

| Value | Channel | Notes |
| --- | --- | --- |
| unset, browser | `createLocalChannel` | `BroadcastChannel`; keeps a DM tab and a player tab in step |
| set | `createSocketChannel` | WebSocket with backoff; reports `live` / `reconnecting` / `offline` |
| no browser | `createNullChannel` | Always `live`, delivers nothing — for tests |

Events are notifications, not payloads: a receiver is told *what changed* and re-reads through
the repository. That is why a stale event can never write stale data.
[withRealtime.ts](src/domain/data/withRealtime.ts) wraps a repository set so a write publishes
its own event; `useRealtime(kinds, handler)` subscribes a screen to the ones it cares about.

To wire a backend: implement `apiContract.ts`, set both variables, change nothing else.

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

With every variable unset the application runs entirely on local fixtures: no server, no
account, no network. That is the supported way to develop the UI and it is what a fresh clone
does. `.env.example` documents the two that exist — `VITE_API_BASE_URL` and `VITE_REALTIME_URL`.

Never create or commit a real `.env` by hand — run `06-CREATE-LOCAL-ENV.cmd` when local secrets
become necessary. Vite inlines every `VITE_*` variable into the browser bundle, so never put a
key, token or connection string behind that prefix. Nothing in this application reads a
credential.

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
    index.tsx           DM characters, player dice/party/characters; re-export barrel
    campaign/           Campaign list, overview, party, encounters, combats, settings
    builder/            The guided character builder (generic shell + field renderers)
    character/          Sheet, edit, privacy controls, guided level up
    monsters/           Library, sheet, homebrew editor (create / clone / edit)
    encounters/         Encounter library, detail, builder, balance panel
    combat/             DM live combat — setup, runner, actions, log, ended
    player/             The player's mobile combat screen and its turn logic
  domain/
    types.ts            Core entities — names no D&D concept
    permissions.ts      Visibility rules (a UI guard, not a security boundary)
    ruleset/            The game-system seam; dnd5e is the first adapter
    data/               Repository interfaces, fixtures, HTTP client, realtime, session
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

## Handoff

Phase 1 is complete as a prompt sequence: TC-00 through TC-17, tracked in `PROJECT_STATUS.md`,
with per-prompt reasoning in `DECISIONS.md` and per-prompt output in `IMPLEMENTATION_STATUS.md`.
`REQUIREMENTS_TRACEABILITY.md` maps every item of `Requirements.md` §6 to its routes, components
and tests.

### Where to start reading

1. [src/app/routes.tsx](src/app/routes.tsx) — the whole route graph on one screen.
2. [src/domain/types.ts](src/domain/types.ts) — the entities, and the vocabulary the product uses.
3. [src/domain/ruleset/Ruleset.ts](src/domain/ruleset/Ruleset.ts) — every question a screen is
   allowed to ask the rules.
4. [src/domain/data/repositories.ts](src/domain/data/repositories.ts) — every read and write,
   with the write policy in the header.
5. [src/screens/combat/CombatRunner.tsx](src/screens/combat/CombatRunner.tsx) — the hardest
   screen, and the one everything else exists to support.

### Three rules that are enforced by tests, not by convention

- **No D&D outside `ruleset/dnd5e`.** [domain.test.ts](src/domain/domain.test.ts) walks every
  source file. Needing a D&D value elsewhere is the signal to widen `Ruleset`.
- **No unexercised seam method.** [rulesetContract.test.ts](src/domain/rulesetContract.test.ts)
  fails when a `Ruleset` method has no test anywhere.
- **No navigation without a route.** [routes.test.ts](src/app/routes.test.ts) fails when a
  sidebar or bottom-bar destination has nothing behind it.

### Known limitations

- **No backend.** The HTTP repositories and the socket channel are written and typed against
  `apiContract.ts`, but nothing has been run against a real server. Expect to find contract
  mismatches on first connection, not architectural ones.
- **No authentication.** `SessionProvider` establishes *who* the user is; nothing establishes
  *that* they are. `permissions.ts` is a UI guard and says so in its header — every visibility
  rule must be re-enforced server-side.
- **No content ingest.** Monsters are real SRD stat blocks hand-authored into the ingest shape.
  There are no spells and no items, which is why the design's Spells and Items sidebar sections
  are absent.
- **No DOM in tests.** `node --test` with type stripping is the whole harness, so hooks and
  layout are covered by testing the pure logic beneath them and, where that is not possible, by
  asserting rules read from source. Those files say so in their own headers. The manual pass this
  leaves is listed at the end of `DECISIONS.md`.
- **One DM per campaign, one campaign per player.** Both are Phase 1 simplifications from
  `Requirements.md`, not gaps.

### Next recommended work

1. **Stand up the API.** Implement `apiContract.ts`, point `VITE_API_BASE_URL` at it, and fix
   what the contract got wrong. This unblocks everything else.
2. **Real authentication**, and re-enforce every rule in `permissions.ts` on the server. The
   client is not a security boundary.
3. **The realtime server** behind `VITE_REALTIME_URL`. The client already handles reconnect,
   backoff and state restoration; it has never spoken to a peer that was not another browser tab.
4. **The 5e.tools ingest.** The `Monster` shape and `origin: 'library' | 'homebrew'` split are
   already what a pipeline would write into. Spells and items follow, and the two sidebar
   sections come back with them.
5. **A DOM test environment**, if the project wants component-level tests. That is a real
   dependency decision, not a refactor — see the test-stack note in `DECISIONS.md` (TC-16) for
   what it would and would not buy.
