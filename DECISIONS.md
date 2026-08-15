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

---

## TC-02 — App shell, navigation and routing

**Router: `react-router-dom` v7.** The first runtime dependency beyond React. Phase 1 has ~20
routes with parameters (`:campaignId`, `:monsterId`), nested layouts (campaign tabs inside the DM
shell) and a genuine 404. A hand-rolled router covers the first two of those and then grows a
bug for each of the rest.

**Two shells, not one responsive layout.** The design specifies two different compositions, and
the mobile player shell is explicitly "not a compressed version of the same layout". So `/dm/*`
renders `DMShell` (sidebar + top bar + workspace + context column) and `/play/*` renders
`PlayerShell` (header + content + bottom nav). Entry routes (`/`, `/join`, `/campaigns/new`) sit
outside both, because a player arriving from an invite link should reach their character, not a
shell they have no use for yet.

**The context panel is not the design system's `Drawer`.** This is the significant call in TC-02.
`Drawer` is built on `<dialog>.showModal()` — focus trap, inert background, scrim. The design
says the opposite for the tablet context panel: *"the context panel leaves the flow, returning as
a non-modal drawer with the workspace reserving its width. Nothing behind the drawer is blocked,
and no scrim appears — the DM is still running a fight."* So `ContextPanel` is a separate
component with two CSS-driven modes — docked in its own column at ≥1280px, non-modal overlay with
a reserved-width workspace below it — and keeps only the helpful parts of dialog behaviour
(Escape to close, focus moves in on open and returns on close). `Drawer` remains the right choice
for a genuine interruption.

**Density is a JS attribute, not a media query.** `[data-density]` cannot be set from CSS, and the
design steps the DM from `compact` at desktop to `comfortable` at tablet ("density steps up, not
down — the DM is touching this screen, often one-handed"). A small `useMediaQuery` built on
`useSyncExternalStore` drives it, so the shell never paints a frame at the wrong breakpoint.

**Two design sources disagreed on the player bottom nav.** Part 1's summary card lists
"Sheet · Combat · Dice · Party · Build"; Part 2's implemented `navItems` is Home, Sheet, Combat
(badged), Dice, Party — no Build. The implemented component data is followed, since it is what the
screens actually render; the builder is reached from My characters.

**The DM sidebar is context-dependent**, which the design shows but does not spell out: screen 27
(DM home) groups Session / Library / Campaigns-list, while screen 01 (inside a campaign) groups
Session / Library / Campaign(Party, Sessions). `nav.ts` returns whichever the current route calls
for.

**Deliberately not faked.** The design says an active combat pins itself to the top of the
sidebar for its duration. That needs real combat state from TC-03/TC-11, so there is a documented
comment where it goes and nothing rendered — a permanent placeholder is exactly the empty promise
the design rules out. No disabled Phase 2/3 nav items appear anywhere.

**`Button` and `NavItem` became polymorphic** (`as` prop) so navigation controls render as real
links — middle-click, open-in-new-tab and the link role keep working. The design system stays
router-agnostic; the app passes the router's `Link` in.

---

## TC-03 — Domain model, ruleset seam and data layer

**The core model names no D&D concept.** `src/domain/types.ts` has no armour class, no ability
scores, no spell slots, no proficiency bonus. What it does have is what the systems in scope
share *and* what the approved design already treats as core UI: identity, ownership, a
`HealthTrack`, initiative order, `Condition`, `Roll`, and visibility. D&D's specifics reach the UI
as generic shapes — `Attribute`, `DerivedValue`, `ResourcePool` — plus an opaque `systemData` bag
the core never interprets.

That line was drawn from the design, not from taste: `HPBar`, `InitiativeRow` and `ConditionChip`
are design-system components, so hit points and conditions are core. Death saves are not — the
design names "whether death saves exist" as a ruleset decision, so they sit behind
`RulesetCapabilities.deathSaves`.

**One module imports the D&D adapter: `ruleset/registry.ts`.** Everything else calls
`requireRuleset(systemId)` and talks to the `Ruleset` interface. This is enforced, not just
documented — `domain.test.ts` walks every `.ts`/`.tsx` file under `src/` and fails if any of them
imports `ruleset/dnd5e`. A second test strips comments from `types.ts` and asserts the declared
surface names no D&D concept. Acceptance criterion three is a test, not a claim.

**Capabilities rather than optional methods.** Where a method would only make sense for D&D, the
ruleset declines it: `spellSlots()` returns null for a system without magic, `deathSaveOutcome()`
returns null without death saves. The UI asks the capability and renders nothing rather than
rendering something disabled — the same rule the design applies to navigation.

**Repositories are async from day one**, even though today they resolve fixtures on a microtask.
Making them synchronous now would mean rewriting every consumer the day TC-13 introduces a
network. Library content (ingested monsters) and user campaign data are separate repositories, as
the requirements demand ingestion stay isolated.

**Fixtures are the design's own sample data** — the same party at the same hit points, the same
fight at round 3, the same unrevealed Cragmaw Ambusher. A screen built against them can be
compared directly with the design canvas, and it satisfies the standing rule about realistic
tabletop content. Fixtures store no derived values: armour class is computed by the adapter at
read time, so fixtures cannot drift out of step with the rules.

**Deliberately not built.** No state-management library, no cache, no optimistic updates, no
realtime subscription machinery. `useAsync` is ~25 lines with a three-state shape that forces
every screen to have a loading and an error branch. TC-13 owns the transport, and building a
client for an API that does not exist yet would be guessing.

**Two shortcuts with a stated ceiling.** `hpBand()` from TC-01 now has a natural home in the
ruleset but has not moved — the design's band thresholds are still unstated, and moving it would
imply a precision the source does not have. And `permissions.ts` is a UI-layer guard, not a
security boundary: the same rules must be enforced server-side in TC-13. Both are marked in the
code.

**`tsconfig` lib moved to ES2023** for `Array#toSorted`, so the fixture repositories sort without
mutating shared arrays.

---

## TC-04 — Entry, DM Home and Player Home

**States are reachable, not just implemented.** The prompt names six states the homes must
handle. A branch nobody can reach is a branch nobody has checked, so `createFixtureRepositories`
takes a scenario — `populated`, `first-time`, `empty`, `loading`, `error` — and
`RepositoryProvider` reads `?scenario=` from the URL. `/dm?scenario=error` renders the real error
path, not a mock of it. Six tests pin the scenarios, including one asserting the error message
never mentions the transport.

`first-time` and `empty` are deliberately different: a first-time user has no campaigns at all and
gets onboarding, while `empty` keeps the campaigns and strips their contents, so the home renders
its normal frame around empty sections.

**Two new domain entities, both demanded by the approved screen.** `RecentItem` powers "Recently
opened" — the design's "recall over navigation" argument, that a DM returns to the same six things
rather than searching. `CampaignActivity` powers "Party changes since last session". Neither is
analytics: the design is explicit that the DM home carries no session counts, no XP graphs and no
"campaign health", and every activity row is actionable.

**`combats.liveForUser()` rather than a loop.** "Continue active combat" is the first thing both
homes ask, and a DM with six campaigns should not pay six round trips to learn nothing is running.

**The live band is absent, not empty, when nothing is running.** The design states this for the
player — "the character becomes the first thing on the screen" — and the same reasoning applies to
the DM. It is also the only element allowed to be visually loud on either home, because it is the
only thing that is time-critical.

**Level-up copy is generated, not hardcoded.** The design's player home reads "Six decisions,
about two minutes". That count comes from `ruleset.levelUpSteps().length`, so it stays true when
the rules change and would be a different number under a different system. The whole block is
gated on `ruleset.capabilities.levelling`.

**No authentication.** Sign-in validates shape only and navigates onward; TC-13 owns sessions and
credentials. Marked in the code so nothing mistakes it for a security control. The player home
picks the signed-in user's first character because there is no session identity yet to pick by —
threading a fake one through the app to avoid that line would be worse.

**`Chip` joined `Button` and `NavItem` as polymorphic**, so recall chips are real links.

---

## TC-05 — Campaigns and party

**The party table is built once.** The design says it outright: "the party table is the party
screen" — the overview shows it in a column, and the Party tab is the same table at full width
with privacy state and an invite row added. Building it twice would guarantee drift, so columns,
rows and the status derivation live in `screens/campaign/shared.tsx` and both screens call it.

**"Open Character details in context" is exactly what the TC-02 context panel is for.** Clicking
a party row opens the character beside the table — health, conditions, calculated values,
abilities, and what the party cannot see — while the roster stays where it was. The full sheet is
still one link away. No navigation, no modal, no losing your place.

**First write methods.** `campaigns.create()` and `characters.attachToCampaign()`. Until now the
data layer was read-only, and a Create-campaign flow that creates nothing is not a usable flow.
Writes mutate the module-level fixture arrays: they survive navigation but not a reload. That is
the honest ceiling of a fixture layer, stated in the file rather than implied.

`useAsync` gained a `reload()` so a screen can show what it just changed. It is intersected onto
the state union rather than returned beside it, so `status === 'ready'` still narrows `data`.

**Attaching is a link, not a move.** A character exists independently of any campaign and outlives
it, so attaching sets `campaignId` and adds the owner as a member while leaving ownership alone. A
test pins that.

**`Character.archetype` rather than reading `systemData`.** The design's party table has a Class
column, and the prompt asks for "class/equivalent". Class is a D&D word, and screens must not read
`systemData`, so the core gained one generic field: the system's word for what kind of character
this is. The party table renders it under the label "Class" because the active ruleset is D&D;
another system would label its own column.

**Campaign List is not a design screen.** The design reaches campaigns from the sidebar group, so
there is no approved layout for a list. The prompt asks for one, so it is rows in the same
language as every other roster rather than a new card pattern — nothing invented.

**Settings is a shell, deliberately.** Name, system, invite and the one DM. No co-DM controls, no
danger zone, no notification preferences — Phase 1 does not own those, and the design's rule is
that a future feature is absent rather than shown disabled.

**Phase 2 extensibility is structural, not planned-for.** Campaign sub-navigation is `campaignTabs()`
in `app/nav.ts`; Lore, NPCs, Locations, Quests and Notes insert between Party and Encounters by
adding entries to that array and routes to the layout's children. No screen hardcodes the tab
list, and none is shown disabled today.

**Invite codes are generated client-side and are not a secret.** `makeInviteCode` produces the
design's `WORD-1234` shape for the fixture flow. A real code is minted server-side in TC-13; this
must not become the thing that guards a campaign, and the code says so.

---

## TC-06 — The guided character builder

**The wizard renders a schema, not D&D.** This is the whole design of TC-06. The prompt
requires that steps come from the active ruleset adapter, so `Ruleset` gained a step-form
contract — `draftSteps`, `draftStepForm`, `validateStep`, `applyChoice`, `draftToCharacter`,
`reviewGroups`, `canOverride` — and the shell renders exactly four field kinds:
`single-choice`, `multi-choice`, `score-assignment` and `text`.

`BuilderScreen.tsx` and `fields.tsx` contain no species, no classes, no ability scores, no
armour. A different system emits the same four shapes and gets the same wizard. The
boundary test that has guarded the D&D adapter since TC-03 covers these files too.

**A `CharacterDraft` is not a `Character`.** It has no rules-valid shape, so it lives in
its own repository and can never turn up in a party by accident. Only `finalise()` turns
one into the other.

**Autosave persists to localStorage.** Autosave that vanishes on reload is not autosave —
a half-built character is exactly what a user expects to survive closing a tab. Writes are
debounced 400ms so typing a backstory does not write per keystroke, and both a corrupt
store and a quota failure fall back to memory rather than taking the builder down. TC-13
moves this to the server without the interface changing.

**Validation is per field, not per step.** `validateStep` returns issues carrying the
field key, which is what lets the design's behaviour work: the alert names the missing
choice, that group alone is outlined in crimson, and the footer counts what remains.
Issues only surface after a Continue attempt — being told you are wrong before you have
tried is hostile.

**Continue disables; Back and "Save and finish later" never do.** The design is explicit
that an incomplete character is a legitimate draft.

**Dependencies are cleared, not silently kept.** Changing class drops a fighting style,
skills, cantrips and spells, because a Fighter's picks are not a Wizard's and keeping them
would produce a character the rules disallow. Choosing a background releases a class skill
it now grants free. Both are tested.

**Two compositions, not one responsive layout.** Desktop is three columns — steps,
question, live summary. Mobile is one decision per screen, a sticky Continue, the desktop
rail reduced to a progress bar, and the summary behind a header button as a Drawer. The
design calls this out specifically: "not a compressed version of the same layout".

**"Updated by this step" is computed, not written.** The shell diffs the derived values
before and after a step and reports what moved. It has no idea that hit points or armour
class exist — it compares labelled numbers.

**Overrides are the ruleset's call.** `canOverride()` allows hit points and armour class
and refuses everything else, so the review step cannot be used to edit around the rules.

**Fixed a latent TC-01 bug**: `TextareaProps` extended `InputHTMLAttributes`, which
silently rejects valid textarea props such as `rows`.

**The builder sits outside both shells** at `/builder`. It is a focused task rather than a
destination, and the design gives it the whole viewport on desktop and mobile alike.

---

## TC-07 — Character sheet, privacy and level up

**The sheet's content comes through the ruleset seam too.** `Ruleset` gained
`sheetSections()` and `sheetContent()`, returning generic shapes — a rollable row, a
label/value pair, a prose block, a resource pool. `CharacterSheet.tsx` renders those four
and names no D&D concept, exactly as the builder does.

**Modifiers arrive applied, and stay checkable.** An attack row's button reads
`1d20 +6` with proficiency and ability already in it, and the damage row shows the die and
the modifier separately. A fighting style reaches the button rather than a footnote:
Archery adds +2 to ranged attacks inside `sheetContent`, so what a player taps is correct
without them doing arithmetic at the table.

**Privacy is a sentence, not a lock icon.** The requirement is that it be understandable
beyond a tiny glyph, and the design's answer is specific, so each row carries three
things: the level as a word with a glyph, a sentence naming who is affected ("Hidden from
the party. Marta can still see it."), and the switch. The screen opens with "Your DM
always sees everything", because that is the fact a player most needs and most doubts.

**A hidden section has no tab at all.** Not a locked tab, not an empty one — another
player simply does not see that the section exists. `sheetSections()` is filtered through
`canSeeCharacterSection` before rendering.

**Sections that cannot be hidden show fixed text, never a disabled switch**, so nobody
hunts for a control that does not exist. Combat state is the one that cannot: a fight
cannot be run if the other players cannot see who is hurt.

**Level up reuses the builder.** Same field schema, same `BuilderFieldControl`, same
validation shape — `levelUpStepForm` returns a `BuilderStepForm`. The step list is
generated: a Battle Master Fighter reaching 7 gets hit points, one manoeuvre and a review,
because that is genuinely all they decide.

**The review's split is computed, not written.** `levelUpChanges()` returns `chosen` and
`automatic` separately, and "Proficiency bonus unchanged · No change" is stated rather
than omitted — silence about a value that did not move is worse than a line saying so.

**Desktop spends width on simultaneity, not features.** A fixed 360px identity column and
a scrolling content column, skills two-up, and the full hit-point control inline rather
than behind a tap. The tab set, the row components and the ordering are identical to
mobile, so a player who learned the phone knows the desktop.

**`IconButton` became polymorphic**, joining `Button`, `NavItem`, `Chip` and `ListRow`.

**Fixture characters gained skill proficiencies**, so the sheet shows real numbers —
Aria reads Athletics +6 and Intimidation +4, matching the design's own screen.

### Two honest gaps

**Privacy changes do not persist.** The character repository has no update method; TC-13
owns writes to an existing character. The toggles work and the screen states plainly that
the change is held on the device. Building a write path here would mean guessing at the
API TC-13 defines.

**Confirming a level up computes the advanced character but does not save it**, for the
same reason. `applyLevelUp()` runs and is tested; persisting its result is one call away.
Both are marked in the code rather than left to be discovered.

---

## TC-08a — Monster library

**A table, not a card grid.** The design says it outright and gives the reason: a DM
comparing four candidates is comparing numbers, and numbers compare in columns. Name,
type, size, CR, AC, HP and source in aligned columns at compact density, sorted by
difficulty descending — a DM picking an opponent shops downward from "too hard".

**Filters are generic, declared by the ruleset.** `Monster` gained `facets` — named,
multi-valued tags the core never interprets — and `Ruleset.monsterFacets()` declares which
are worth filtering by and which is `primary`. The filter bar renders what the ruleset
declares, so a system with different creature taxonomy gets working filters without the
screen changing. Values within a facet are OR-ed and facets are AND-ed: adding a second
type widens, adding a size narrows.

**Progressive, as specified.** Creature type and the difficulty range do most of the work
and are visible; size, environment and source sit behind "More filters". Every applied
filter becomes a dismissible chip, and the result count is stated in words above the
table, so what is narrowing the list is never hidden.

**Homebrew is badged in place, not filed apart.** The design's reasoning: a DM searching
for a goblin should find their edited goblin next to the printed one, because the
distinction matters for trust rather than for navigation. `source` is a column; homebrew
carries a brass badge and names its owner rather than a book. It can still be isolated
from "More filters" when a DM wants only their own.

**The panel is the sheet.** There is no monster page to navigate to. Selecting a row fills
the TC-02 context panel with the full stat block and its three primary actions — add,
clone, roll hit points — so preparation never leaves the screen. Opened from combat later,
the identical panel appears.

**The library is a compact table, not fifty objects.** `monsterLibrary.ts` holds reference
data as rows with the same eight fields repeated, expanded by `toMonsters()`. Shorter to
read and much harder to get inconsistent than one hand-written object per creature. 50
creatures spanning CR 1/8 to 23 and every creature type, so the filters, the sort and the
long-list behaviour are exercised against something that looks real.

**Search reaches the subtitle**, so "goblinoid" and "dragon" find what a DM means, not only
exact-name matches.

### Not in this slice

Clone and create-custom are routed and linked but land in TC-08b. "Add to encounter" needs
an encounter to add to, which is TC-10. Both are visible affordances rather than hidden
ones, because the design shows them on this screen — but neither is wired to a mutation
yet, and nothing pretends otherwise.
