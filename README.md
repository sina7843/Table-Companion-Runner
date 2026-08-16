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
| Backend    | `node:http` (no framework)    |
| Database   | PostgreSQL 17 via `pg`        |
| Lint       | oxlint                        |
| Format     | Prettier                      |
| Tests      | `node --test` (no framework)  |

`react-router-dom` and `pg` are the only runtime dependencies. There is no state library, no
data-fetching library, no CSS framework, no test framework, no web framework and no ORM: state
is React state behind repository interfaces, the server is 40 enumerated routes over Node's own
HTTP module, migrations are SQL files, and the test harness is Node's own runner over TypeScript
with native type stripping. See `DECISIONS.md` for why Next.js and Tailwind were not used, and
for why the backend has no framework either.

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
| `npm run test`         | Node's built-in test runner over `src/` and `server/` |
| `npm run lint`         | oxlint over `src` and `server`                   |
| `npm run format`       | Prettier write                                   |
| `npm run format:check` | Prettier check, no writes                        |
| `npm run server`       | The backend, on http://localhost:8787            |
| `npm run server:dev`   | The backend with `--watch`                       |
| `npm run db:migrate`   | Applies pending SQL migrations                   |
| `npm run db:seed`      | Loads the demo world; insert-only, never destructive |

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
| unset | `createFixtureRepositories` | In-memory; the design's own party, fight and monsters. Development only |
| set | `createHttpRepositories` | Every route and verb is declared in [apiContract.ts](src/domain/data/apiContract.ts), and served by [server/](server/) |

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

The HTTP half of that contract is implemented — see **Backend** below. Wiring the frontend to it
is one environment variable and no code change, which is what the seam was for.

## Backend

A Node + TypeScript service in [server/](server/), sharing `src/domain/types.ts` as the wire
format and implementing [apiContract.ts](src/domain/data/apiContract.ts) route for route. It is
the PostgreSQL half of the same `Repositories` interface the fixtures satisfy.

```bash
docker compose up -d    # PostgreSQL 17 on 127.0.0.1:5434, named volume, never auto-wiped
npm run db:migrate      # apply migrations (the server also does this on boot)
npm run db:seed         # load the demo world — insert-only, safe to re-run
npm run server          # http://localhost:8787
```

Set `DATABASE_URL` first; `.env.example` documents it and every other variable. It is a
credential and is never prefixed `VITE_`, because Vite inlines those into the browser bundle.

To point the app at it, run `npm run dev` with `VITE_API_BASE_URL=/api`. The Vite dev server
proxies `/api` to the backend, so the browser makes a **same-origin** request — no CORS, and the
shape a SameSite session cookie will need when TC-P02 adds authentication.

| File | What |
| --- | --- |
| [server/main.ts](server/main.ts) | Entrypoint: configure, migrate, listen, shut down cleanly |
| [server/config.ts](server/config.ts) | Environment, validated at startup rather than at first use |
| [server/db.ts](server/db.ts) | The pool. `query` and `tx`, and the only import of `pg` |
| [server/migrations/](server/migrations/) | Plain SQL, applied in filename order, additive only |
| [server/migrate.ts](server/migrate.ts) | The runner: one transaction per file, recorded by name |
| [server/store.ts](server/store.ts) | `Repositories` over SQL — the twin of `fixtureRepositories.ts` |
| [server/rateLimit.ts](server/rateLimit.ts) | Abuse control: a fixed window, per account or address |
| [server/log.ts](server/log.ts) | Structured logs, and the rule about what may go in one |
| [server/authorize.ts](server/authorize.ts) | Every authorization rule, in one wrapper |
| [server/auth.ts](server/auth.ts) | Passwords, sessions, cookies, CSRF. `node:crypto` only |
| [server/combatPolicy.ts](server/combatPolicy.ts) | What a player's device may change about a fight |
| [server/routes.ts](server/routes.ts) | One entry per contract route. No business logic |
| [server/http.ts](server/http.ts) | Matcher, JSON, error mapping. No framework |
| [server/seed.ts](server/seed.ts) | The demo world as development data |

Three rules the schema enforces rather than trusts:

1. **No D&D column on a generic entity.** Attributes, `systemData`, action groups and builder
   choices are JSONB. The database is as game-system agnostic as `types.ts` is.
2. **Library content is owned by nobody.** A check constraint refuses a library monster with an
   owner, and the store's `create` and `save` always produce homebrew — so ingested reference
   data and user campaign data cannot merge by accident.
3. **A fight cannot edit the encounter it came from.** No statement in the store writes a
   template's roster from a combat write; `startFromTemplate` touches `last_run_at` and nothing
   else, and a test asserts the rest of the template is byte-identical afterwards.

### Authentication and authorization

Real as of TC-P02, and the server is the authority.

**Signing in.** `POST /auth/sign-in` checks a scrypt digest and answers with an HttpOnly,
`SameSite=Strict` session cookie. The token is never stored — the database holds its SHA-256 —
and never reaches JavaScript, so there is nothing in the browser bundle to leak. Expiry slides
on use. `GET /me` is both "who am I" and "am I still signed in". Sign-in answers the same
sentence for a wrong password and an unknown address, and takes the same time either way.

**Everything else needs a session.** Three routes are anonymous — sign in, sign up, sign out —
and a route is protected by having said nothing. [auth.test.ts](server/auth.test.ts) walks the
whole table and fails if any other route answers something other than 401 without a cookie.

**One place holds the rules.** [server/authorize.ts](server/authorize.ts) wraps the store with
the caller's identity, and a route handler is only ever given the wrapped one — there is
nowhere to forget a check. A role is read from `campaign_members`, never from the request.

**Private data is absent, not hidden.** The server runs
[permissions.ts](src/domain/permissions.ts) — the same module the screens use — *before*
serialising. An unrevealed creature is not in the player's payload; a secret roll is not in
their log; a hidden character section's ruleset data is not on the wire. The client's copies of
those rules decide what to draw; they decide nothing about what is sent.

Where the contract types a read as `T | null`, a record you may not have reads as `null` —
indistinguishable from one that does not exist, so probing ids tells an attacker nothing.
Everywhere else it is a 403.

**CSRF.** The deployment is same-origin, so nothing legitimate is cross-site. `SameSite=Strict`
means a cross-site request arrives with no cookie and therefore no authority; on top of that,
an unsafe method must state `Sec-Fetch-Site: same-origin` or carry an allowlisted `Origin`. No
CORS headers are emitted at all, deliberately.

**Combat, until TC-P04.** `PUT /combats/:id` still takes a whole record, so a player's write is
checked as a diff by [combatPolicy.ts](server/combatPolicy.ts): they may act on their own
combatant, damage a creature, target anyone and end their own turn. They may not rewrite the
roster, reveal a hidden creature, edit initiative, start or end the fight, take someone else's
turn, or touch another character's health, conditions or death saves.

### The API boundary

Hardened at TC-P03. Everything below is enforced before a handler runs, in this order — each
step cheap, each refusing on its own, so nothing expensive happens for a request that was never
going to be allowed.

**One schema strategy, both directions.** [schema.ts](src/domain/data/schema.ts) is a small set
of combinators; [contractSchemas.ts](src/domain/data/contractSchemas.ts) declares every shape on
the wire, once, built twice. Requests are validated **strictly** — an unrecognised key is an
over-post and a 400, not something quietly ignored — and responses **leniently**, so a
deployment ahead of this build drops an unknown field rather than breaking a user. The client
validates too: `as T` is gone from `httpRepositories.ts`.

The schemas live under `src/domain/data/` rather than in `server/` because both halves need
them, for the same reason `types.ts` is the wire format. `schema.test.ts` pushes every fixture
in the demo world through the strict schemas, so a schema that has drifted from the domain fails.

**Errors have codes.** Every failure answers
`{ error: { code, message, requestId, details? } }`. The codes are the contract and are listed
in [apiContract.ts](src/domain/data/apiContract.ts); the messages are for people and may be
reworded. `details` names fields, never values — a rejected password is never quoted back.

| Code | When |
| --- | --- |
| `unauthenticated` | no session, or an expired one |
| `forbidden` | signed in, not allowed, and signing in again will not help |
| `not_found` | no such record, or none this caller may know about — indistinguishable on purpose |
| `conflict` | understood, and at odds with the current state |
| `validation_failed` | the body or query did not check out |
| `rate_limited` | too many; `Retry-After` says when |
| `payload_too_large` / `not_supported` / `internal` | as they read |

**Correlation.** Every response carries `X-Request-Id` — echoed from the caller when it is short
and boring, minted otherwise — and it appears in the error body and the log line for the same
request. A report of "it said something went wrong" is traceable from that alone.

**Logs are structured, and bounded in what they may say.** One JSON line per request:
timestamp, level, request id, method, **route pattern**, status, duration, account. Never a
body, a cookie, a token, a query string or a resolved path — `/campaigns/:campaignId` says
everything an operator needs and nothing a subject would object to.

**Rate limits.** Per account where there is one, per address where there is not.
Sign-in and sign-up 10 per 15 minutes, invite redemption 20 per hour, rolls 600 per minute,
other writes 600 per minute, reads 3000 per minute. In-memory and therefore per-process — a
shared counter belongs with horizontal scaling in TC-P09, and the file says so.

**Pagination.** `monsters.list` takes `limit` and `offset` and is capped at 200 whether or not
a limit was asked for; `monsters.count` is unbounded, so a truncated page is visible in the
library's "N of M" line rather than silent. A combat's roll log reads at most 500. The feeds cap
at 100.

**Idempotency, stated.** `PUT` takes the whole record and is idempotent by construction —
that is why autosave can fire three times safely. `POST` mints an id and is not, which is why
`repositories.ts` tells callers to wait rather than retry a `create`. The one retry-sensitive
`POST` is `rolls.record`, and it distinguishes the two cases that look identical from the
server: the same id with the same payload is a **retry** and returns the stored roll; the same
id with a different payload is a **collision** between two devices and is kept under a
server-minted id.

**Same-origin, explicitly.** The page and the API share an origin — Vite proxies `/api` in
development — so **no CORS header is emitted at all** and the session cookie is
`SameSite=Strict`. A cross-origin deployment is a deliberate switch (`TC_CROSS_ORIGIN`): it
requires an origin allowlist, emits CORS with credentials, answers preflight, and forces
`SameSite=None`, which browsers only accept with `Secure` — so the server refuses the
combination outside production rather than letting it fail in a browser.

### What the backend is not yet

- **It is not authoritative over combat.** Dice are still rolled on the client and roll ids are
  still minted there, so a player can decide how much damage their own attack did.
  `combats.version` is maintained but not yet checked, so two writers can still race. TC-P04.
- **There is no account-creation screen.** `POST /auth/sign-up` exists and works; the approved
  design draws no surface for it, so nothing in Phase 1 calls it. TC-P07 owns account
  lifecycle — including password change, which would revoke sessions
  (`revokeAllSessions` is written and waiting).

Those are TC-P00's gap map, and what remains is deliberately left whole for the prompt that
owns it rather than half-fixed here.

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

With every variable unset the frontend runs entirely on local fixtures: no server, no account,
no network. That is still the supported way to develop the UI on its own, and it is what a fresh
clone does. It is a development mode, not storage — anything written that way is gone on reload.

`.env.example` documents every variable and is explicit about which side of the line each one is
on:

| Variable | Read by | Notes |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Browser | Unset ⇒ fixtures. `/api` in development, via the dev-server proxy |
| `VITE_REALTIME_URL` | Browser | Unset ⇒ `BroadcastChannel`. No realtime server exists yet |
| `DATABASE_URL` | Server | **A credential.** Never `VITE_`-prefixed, never committed |
| `PORT` | Server | Backend listen port, default 8787 |
| `TC_API_TARGET` | Vite dev server | Where `/api` is proxied |
| `TC_ALLOWED_ORIGINS` | Server | Allowlist for unsafe requests with no `Sec-Fetch-Site`. No wildcard |
| `TC_CROSS_ORIGIN` | Server | Switch to a cross-origin topology with CORS. Off; production only |
| `TC_TRUST_PROXY` | Server | Believe `X-Forwarded-For` when rate limiting. Off unless a proxy rewrites it |

No variable signs anybody in. `npm run db:seed` gives the demo accounts the password
`table-companion-dev` — the DM is `marta@example.test`.

Never create or commit a real `.env` by hand — run `06-CREATE-LOCAL-ENV.cmd` when local secrets
become necessary. Vite inlines every `VITE_*` variable into the browser bundle, so never put a
key, token or connection string behind that prefix. Nothing in the browser bundle reads a
credential, and nothing in it ever will.

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

server/
  main.ts               Entrypoint: configure, migrate, listen, shut down
  config.ts             Server environment, validated at startup
  db.ts                 The pg pool — query, transaction, and nothing else
  migrate.ts            SQL migration runner, one transaction per file
  migrations/*.sql      The schema. Additive only
  store.ts              Repositories over PostgreSQL
  authorize.ts          Every authorization rule, in one wrapper
  rateLimit.ts          Fixed-window abuse control
  log.ts                Structured logs, and what may not go in one
  auth.ts               Passwords, sessions, cookies, CSRF
  combatPolicy.ts       What a player may change about a fight
  routes.ts             One entry per apiContract.ts route
  http.ts               Route matching, JSON, error mapping
  seed.ts               The demo world as development data
  *.test.ts             Routing (no database) and integration (needs one)
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

- **No account-creation screen.** The server signs people up; the approved design draws no
  surface that asks it to. TC-P07.
- **No realtime server.** The socket channel is written and typed but has only ever spoken to
  another browser tab over `BroadcastChannel`. TC-P05.
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

The production sequence in `prompts-extra/` is the ordered plan, and its gap map, checklist and
Golden Path are in `IMPLEMENTATION_STATUS.md`. In short:

1. ~~**Stand up the API.**~~ Done — TC-P01. `apiContract.ts` is implemented over PostgreSQL and
   the contract is now guarded by a test rather than by hope.
2. ~~**Real authentication.**~~ Done — TC-P02. Sessions are cookies, every rule in
   `permissions.ts` is enforced server-side, and private data is filtered before it is sent.
3. ~~**Runtime validation.**~~ Done — TC-P03. One schema strategy on both sides, stable error
   codes, request ids, structured logs, rate limits and pagination bounds.
4. **Server-authoritative combat**: intent-shaped mutations, a checked version, server-minted
   ids and server-rolled dice. TC-P04.
5. **The realtime server** behind `VITE_REALTIME_URL`. The client already handles reconnect,
   backoff and state restoration; it has never spoken to a peer that was not another browser tab.
   TC-P05.
6. **The 5e.tools ingest.** The `Monster` shape, the `origin: 'library' | 'homebrew'` split and
   the unowned-library constraint are already what a pipeline would write into. TC-P06.
7. **A DOM test environment**, if the project wants component-level tests. That is a real
   dependency decision, not a refactor — see the test-stack note in `DECISIONS.md` (TC-16) for
   what it would and would not buy.
