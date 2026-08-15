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

---

## TC-08b — Monster sheet

**One component, three containers.** `MonsterSheet` renders identically in the library's
docked panel, on a full page, and in a drawer opened from an encounter or combat. The
design's rule is that the panel opened from combat is the same panel opened from the
library, so building a second variant would guarantee they drift.

The full page exists for the two cases a 440px panel cannot serve — a deep link someone
was sent, and a viewport too narrow to put a column beside a table. It is not the primary
path; the design is explicit that there is no monster page to navigate to.

**Combat data first, prose last.** Hit points, conditions, the stat line and the actions
come before traits and long-form text, because everything a DM needs while a creature's
turn is running has to be in the first screen without scrolling.

**Actions are grouped, not flat.** `Monster.actionGroups` replaces `Monster.actions`:
actions, bonus actions, reactions, legendary actions and spells are separate groups with
an optional qualifier ("3 per round"). Groups are how a DM reads a creature mid-turn, and
the design flags that most published creatures above the mid ranks have at least one group
beyond plain actions.

**Every action rolls, through one shared primitive.** TC-07 gave the character sheet its
own roll implementation; this slice extracts `useRoller` + `RollReadout` and moves both
sheets onto it. Two screens with their own copies is exactly how they end up disagreeing
about what a critical is. The ruleset still owns the evaluation; the hook owns the plumbing
and the last result.

`Ruleset.monsterActionGroups()` builds the expressions: `+11` becomes `1d20 +11`, and
`2d10 + 6 piercing` yields a `2d10 + 6` roll while the row keeps the damage type for
reading. A pre-built roll — a legendary Detect that rolls Perception — is left alone rather
than recomputed from an attack bonus it does not have.

**Resource state travels with the action.** `Recharge 5-6`, `1 per day`, `3 per round`,
`2 left` are tags on the entry. The design's reason is direct: a DM tracking Legendary
Resistance on paper is what this product exists to remove.

**Instance, not template.** The sheet takes live hit points and conditions as an `instance`
prop rather than reading them off the `Monster`. Editing a creature in a fight must never
touch the library record, and the eyebrow says which it is.

**Not a printed stat block.** The prompt asks for the approved modern design rather than a
paper reproduction, so the sheet is the design system's own structure: a header rule, a
definition list, an interactive ability grid whose stats roll, and action rows. No
two-column justified serif page.

**Detail is honest, not uniform.** Six creatures carry full write-ups. The rest keep the
usable stat line the base table gives them, and every creature gets a speed and a sense
line because without those it cannot be run at all. Inventing legendary actions for a
goblin so the data looked consistent would be worse than leaving it honest. A test enforces
the floor, and it caught the homebrew creature missing both.

## TC-08c — Homebrew creatures

**One screen, three states.** Create, clone and edit are the same `MonsterEditor` with a
different seed and a different banner. The fields a DM edits do not change between them, so
three components would have been three places for the same bug.

**Not one giant form.** Four groups are always open because every creature needs them —
identity, defences, ability scores, actions. Five more are collapsed behind a `+` until
asked for: traits, senses, languages, resistances and immunities, legendary actions. A
goblin variant needs none of them; a homebrew dragon needs all five. Opening an existing
clone expands whichever groups it already uses, so progressive disclosure never hides
content that exists.

**The preview is the real sheet.** `MonsterSheet` renders the live draft, recomputed
through `Ruleset.normaliseMonster()` on every keystroke. A preview built from its own markup
would drift from the sheet the DM actually reads at the table, and then the preview is a
lie. Cost is a re-render per edit on a component that already handles the Beholder.

**Cloning writes immediately.** The copy exists in the library before the DM types
anything, so navigating away mid-edit loses nothing. Everything after that autosaves on a
500 ms debounce — a homebrew creature is a document, not a form to submit. The first write
in create mode inserts; every later write updates.

**Writes always produce homebrew.** `MonsterRepository.create()` and `save()` force
`origin: 'homebrew'` regardless of what they are handed, `save()` rejects a library record
outright, and `remove()` only deletes homebrew. Library content is ingested reference data;
a DM must not be able to change what the book says by accident, and the guard belongs at
the repository rather than in each caller.

**Validation is the ruleset's, not the form's.** `Ruleset.validateMonster()` returns
per-field `BuilderIssue[]` — name present, armour class 1–30, hit points 1–400, each ability
1–30, at least one action. The editor renders whatever it is given against the matching
field key and knows none of those numbers itself, which is the same seam the character
builder uses.

**The difficulty estimate is labelled an estimate.** `Ruleset.estimateChallenge()` bands by
hit points and nudges by armour class and best attack bonus. The published maths scores
defence and offence against separate tables and averages the two; this does the defensive
half properly and says "estimated" everywhere it appears. A DM can always set the challenge
by hand. `ponytail:` upgrade path is noted in `homebrew.ts` — replace with the full
two-table calculation if homebrew balance becomes a feature rather than a convenience.

**`hitPointsFromDice()` refuses rather than guesses.** `"17d12 - 17"` reads as 93; `"lots"`,
`"2d"` and `"0d6"` return `null` and leave the typed hit points alone. Silently producing a
number from nonsense would put a wrong total on a creature that then runs a real fight.

**Clone is a deep-enough copy.** Facets, attributes, health, derived values, traits and
every action entry are copied rather than shared. A test mutates the clone and asserts the
source is byte-identical, because a shallow spread here corrupts library data through an
edit that looks local.

**Scope held to Monster.** No class, subclass, species, background, spell, item or feat
editors, as the prompt specifies for Phase 1.

## TC-09 — Encounter library and detail

**Difficulty is computed, never stored.** `EncounterTemplate.difficultyLabel` is gone.
The design states difficulty against the current party, so a level-up has to change what
the table says; a stored label goes stale the first time someone levels, and two sources
for one number is how they end up disagreeing. `Ruleset.encounterDifficulty(creatures,
party)` answers, and returns `null` for a system that has no such metric rather than the
core inventing one every system is assumed to have.

**The metric is generic, the maths is not.** The seam returns a label, a tone, a 0–100
`fill`, a one-line `detail`, a `breakdown` of label/value rows, an optional `warning`, and
an optional `metric` — a named number a table can sort on without knowing what it means.
For D&D that number is adjusted XP. The core prints all of it verbatim and does no
arithmetic on any of it.

**Status is the first column.** Running, run before, or prepared decides which action the
DM wants — Resume, Run again, Start combat — so it leads the row, and running encounters
sort to the top. Scrolling for the fight that is happening now is the one thing this
screen must never make a DM do.

**Participants are text, not avatars.** `Bugbear Chief ×1 · Goblin ×4` reads faster than a
row of portraits when a DM is scanning twelve encounters for names and counts.

**Starting is not confirmed; deleting is.** The design is explicit that `Start combat`
creates the instance without a dialog and explains the risk in place instead of
interrupting. So the alert above the button says what starting does, and the confirmation
budget is spent on delete, which names the encounter and says what survives it.

**The template sentence is said three times.** The eyebrow reads `Encounter template`, the
alert above the start button explains that starting creates a separate instance, and
`Duplicate template` sits directly under it. A DM who fears damaging a prepared fight will
not reuse it, so the repetition earns its space.

**`startFromTemplate` lives on the combat repository, not the encounter one.** It reads a
template and writes an instance; putting it on `EncounterRepository` would imply the
template is what changes. Counts expand into numbered combatants sharing a group key, the
campaign's party is added without being asked for, hidden entries start `private`, and
nothing has rolled initiative yet. `lastRunAt` is the single field that moves on the
template, because it is a note about the template rather than a change to the fight it
describes. A test pins the whole shape.

**The overflow menu is a dialog.** The design system has no menu primitive, and a popover
built for one screen would be a new component with its own focus and dismissal bugs. A
small `Modal` gets a focus trap and Escape for free, and keeps delete off the row where a
mis-click reaches it.

**The builder's routes exist now.** `/dm/encounters/new` and
`/dm/encounters/:encounterId/edit` are linked from the library, the overflow menu, the
detail page and the DM home, so they have to resolve. `EncounterBuilderPending` renders
the page chrome the builder will fill — the same treatment every route skeleton in
`screens/index.tsx` already gets, not a disabled feature.

**`DMCombat` stopped lying.** It now resolves the fight it was sent to and reports what is
true of it. Starting an encounter and landing on a screen that says "no combat is running"
would have been worse than an unfinished screen. The combat runner itself is still TC-11.

**Fixture rosters were rebalanced, not invented.** Twelve prepared encounters across the
adventure, rated against the actual level 6–7 party: three trivial, three easy, two
medium, three hard, one deadly, and three carrying the close-to-deadly warning. A list
where everything reads the same difficulty demonstrates nothing.

## TC-10 — The encounter builder

**Three regions, and the rail never leaves.** Library on the left, composition in the
middle, balance on the right, as the design specifies. The whole point of the layout is
that adding a creature is a button on a library row and the screen never navigates, so
building a fight is search, add, adjust, repeat. All three wrap rather than shrink, so a
tablet stacks them instead of squeezing the roster to nothing.

**Explicit buttons instead of a clickable row that contains buttons.** The design's
library row is clickable *and* carries a plus button. Our `ListRow` renders a real
`<button>`, and a control inside a control is invalid markup whose inner control stops
reaching the keyboard. So each row is static and carries two icon buttons — read the stat
block, add it. The click count the design cares about is unchanged and the keyboard path
is real rather than nominal.

**The composition rules are pure functions.** `composition.ts` holds add, patch, remove,
present and merge as transforms of a template, and the component only decides when to call
them. Quantity is clamped there, not in the input, so a typed `999` and a held-down
stepper land in the same place. Ten tests cover them; testing this through the component
would have needed a DOM harness this project does not have.

**Every edit goes through a ref.** The shared context panel keeps whatever JSX it was
handed, so a handler closing over `draft` writes a stale roster the second time a DM uses
it — add two creatures from the panel and the first one vanishes. `draftRef` is updated
inside the same call that sets state, so the panel's Add button is always writing to the
current roster.

**Create writes immediately, then takes over its own URL.** `/dm/encounters/new` inserts an
"Untitled encounter" and replaces itself with `/dm/encounters/:id/edit`. The design's empty
state reads `Draft · autosaved`, and autosave needs an id. The cost is a stray template if
a DM opens the builder and leaves at once, which is the same trade the monster clone makes.

**Both immediate writes are now guarded against React's double effect.** StrictMode invokes
the loading effect twice in development, so opening the builder created two encounters and
opening a clone created two monsters. Both call sites now hold the in-flight promise in a
ref — the sibling bug in `MonsterEditor` is fixed in the same change rather than left for
the next person to find.

**Absence is stored, not presence.** `EncounterTemplate.absentCharacterIds` means a
character who joins the campaign next week is in every prepared fight without the DM
reopening twelve templates. Difficulty rates against whoever is left, which is the only
reason the number is trustworthy, and `startFromTemplate` skips them.

**Location is a text field with a datalist, not a select.** The design shows a `Select` over
the campaign's known places, but a DM naming a new room has to be able to type it. A native
`<input list>` gives the same suggestions and still accepts anything, with no new component
and no dead end.

**No drag-and-drop.** The prompt allows it and forbids requiring it; the design says the
same. Roster order carries no meaning — initiative decides turn order, not this list — so
dragging would be a second way to do nothing. Skipped rather than built and ignored.

**Three new design-system adapters.** `NumberInput`, `Switch` and `SegmentedControl`, plus
`icon` on `SectionHeader` and a forwarded `ref` on `TextInput`. The CSS for all of them was
already vendored from the approved source; these are the typed, accessible wrappers the
builder needed, and nothing about the visual contract changed.

**What the design shows and this does not.** The "Group identical" toggle: grouping is the
only state with data behind it, and an expanded view would render N identical rows with
nothing per-creature to edit. It arrives when combat instances carry per-participant names
and initiative, which is TC-11.

## TC-10b — Summary, validation and reliable autosave

**Structural validation is generic; difficulty is the ruleset's.** `validateEncounter`
checks what any system needs — a name, something to fight, someone to fight it, creatures
that still exist, a battlefield that is not entirely invisible, a combatant count that
will not stall a round. It never judges how hard the fight is, because "deadly" is a
judgement a system makes and "empty" is not. No new seam method: the difficulty warning
already comes from `encounterDifficulty`.

**Two severities, and only one of them stops anything.** Blocking issues (no name, no
creatures) disable Start and are stated next to the disabled button, so the reason sits
where the blocked action is. Warnings sit above the roster, because every one of them is
about something the DM can fix right there. A crowded fight is never blocked — a DM
running a siege knows what they are doing.

**Autosave is flushed, not merely debounced.** A 500 ms timer alone loses the last edit
whenever a DM types and immediately clicks Start, Duplicate or Done. Every edit is held in
a `pending` ref; the timer, unmount, `beforeunload` and all three exit paths flush it, and
Start flushes before building the combat so the fight is made from what is actually on
screen. A failed write keeps the edit pending, so both Retry and the next keystroke resend
it.

**Save feedback is one word that changes.** `Draft · autosaved` → `Saving…` → `Saved`, in
the top bar, in `aria-live="polite"`, tinted red only when a write actually failed. No
toast, no spinner over the page — the design's own indicator is a single mono line, and a
DM adding fifteen goblins should not be interrupted fifteen times.

**A stale success can no longer overwrite a fresh save.** `write` only reports `Saved` if
nothing new is queued behind it, so a slow response landing after a newer edit does not
claim the newer one is written.

**The repository hands out copies.** `EncounterRepository` reads, writes and duplicates all
go through `copyTemplate`, which rebuilds `entries` and `absentCharacterIds`. This is what
makes "the template is immutable from combat" a guarantee rather than a convention: no
screen and no future combat runtime can reach the stored template through an object it was
handed, and three tests hold it — a mutated read, two reads not sharing a roster, and a
saved draft the builder keeps editing.

**The large-encounter bar is conditional, not always on.** Past four groups the roster
outruns the aside on a wrapped layout, so a sticky bottom bar carries the counts, the
ruleset's own summary line and Start. Below that it would be chrome duplicating what is
already two inches to the right.

**The difficulty badge moved into the top bar.** The design's large-encounter frame carries
it beside the title, which is the one place it stays visible whatever is scrolled.

## TC-10c — Starting combat

**A fight is a different kind of thing, and the screen says so.** The eyebrow reads
`Combat instance · from <template>`, a banner states that hit points, conditions and
initiative change here while the template stays as prepared, and that banner carries a
link to edit the template instead. Three statements, because the whole reason templates
exist is that a DM who fears damaging a prepared fight will not reuse it.

**The guarantee is structural, not remembered.** Every function in `screens/combat/setup.ts`
takes and returns a `CombatInstance` and none of them can even name an `EncounterTemplate`.
`CombatRepository.save` writes to `ALL_COMBATS` and there is no path from it to
`ALL_ENCOUNTERS`. The final test drives a whole session — roll, rename, hide, remove, begin,
save — and asserts the template comes back byte-identical apart from `lastRunAt`.

**Only meaningful pre-start adjustments.** Initiative, who is actually here, what the party
can see, and giving one member of a group its own name. That is the complete list, and it is
the list of things the template *cannot* decide: everything else was already a decision the
encounter made, and offering it again here would be two places to change one thing.

**One roll per row, not per creature.** Identical creatures take one group turn, so rolling
assigns one number to the whole group. Expanding a row is how a DM breaks that — the one
goblin on the ridge that acts later. `Roll what is missing` never overwrites a number the DM
typed; `Re-roll all` is the explicit opt-in that does.

**No confirmation dialogs anywhere in the flow.** Start combat creates the instance, Begin
round 1 starts it. The design is explicit that the risk is explained in place rather than
by interrupting, and a fight begun by accident is one click from being left.

**Turn order is the ruleset's.** `Ruleset.initiativeOrder` sorts, because what beats what and
how a tie breaks are rules decisions. The 5e adapter puts characters ahead of creatures on a
tie — the published rule compares Dexterity, which a `CombatParticipant` does not carry, and
the table convention it stands in for is that players go first. A participant who has not
rolled sits last rather than being treated as a zero that beat a −1. `ponytail:` give the
participant its initiative modifier if ties ever matter more than this.

**Runtime writes go straight through.** No debounce: initiative and who is present are not a
draft, and a fight that started before its roster saved would be the worst possible bug in
this feature. One writer, in the route, so the setup screen holds no state that can drift.

**Combat reads hand out copies too.** `CombatRepository` gained the same `copyCombat`
discipline the encounter repository already had, participants and their conditions included.

**`/dm/combat/:id` now branches on status.** `preparing` is the setup screen; `live` and
`ended` report the fight and its turn order until TC-11 fills them. The old `DMCombat` route
skeleton is gone. `InitiativeRow` is deliberately not built here — it belongs to the runner,
and half of it now would be two implementations to reconcile later.

## TC-11a — Live combat, the DM's command centre

**The turn is stated four ways, and colour is never one of them alone.** Position in the
order, the round counter reading `Round 3 · turn 3 of 13`, the brass pill naming the
participant, and on the row a solid marker, a tinted surface and the word `Turn`. A DM in a
dim room, or one who does not separate red from green, still knows whose turn it is. Every
other row state pairs its colour with a glyph and a word the same way — `Down` with a
heartbeat, `Out` with a skull, `DM only` with an eye-slash.

**`InitiativeRow` is a div, not a button.** The design's CSS resets `.tc-init` like a button
and the row carries controls, which is a control inside a control: invalid markup whose
inner control never reaches the keyboard. So the row is a div a pointer can click anywhere,
and the *name* is the button — the keyboard path is real rather than nominal, and the
design's own reset moves onto that button instead of into the vendored CSS.

**`.tc-initlist` does the tablet work.** The design ships container queries on that
wrapper: the action cluster is the first thing dropped as the column narrows, the turn
pill's label next, and the name column has a 96px floor so knowing who is in the fight is
the last thing to go. Wrapping the list in it is the whole responsive story — no second
layout, and the same row will work in a Phase 3 VTT sidebar.

**`combat.participants` is the order, not a view of the numbers.** It is sorted once when
the fight begins; after that it is the record. Changing an initiative mid-fight therefore
moves nobody — a list that rearranged under a DM mid-sentence would be worse than a wrong
one — and an inline alert offers `Sort by initiative` when the two disagree. A manual move
is a ruling ("you readied, go after them") and survives until that re-sort is asked for.

**The round moves only when the order wraps.** That is the single place it advances, so
`Previous` past the top of a round steps the round back, and past the top of round 1 does
nothing at all. Defeated combatants are stepped over rather than given a turn to pass on; an
unconscious player still gets theirs, because death saves are a turn.

**The context panel is the shared one.** The same `useContextPanel` the monster library and
the encounter builder use, so a stat block opened from a fight is the one opened everywhere
else, docked in its own column at ≥1280 and a non-modal drawer below it — the fight is
never covered. A character opens a compact identity block instead, because a player's sheet
is theirs and the DM wants hit points and armour, not their backstory.

**Armour class rides the identity line.** `CombatParticipant` does not carry AC, and the
design's row does not show it either — but the prompt requires it and a DM asking "does a
19 hit?" should not have to open a panel. It is resolved from the character or creature
behind the participant and printed in the sub line as text. No new row element.

**Extension 1, as the design proposed it.** `.tc-combatbar` is a 40px toolbar composing
`RoundCounter`, `TurnIndicator`, the `Next ·` label and the turn buttons on
`surface-secondary`. Layout only — no new colour, radius, type or shadow value — and it
lives in the app's own `shell.css`, not in the vendored design system.

**What this slice does not do.** Damage, healing, conditions, the roll log and the dice tray
are TC-11b: this slice's brief is turn order, identity and the context panel, and the HP
control belongs with the actions that change hit points rather than ahead of them. The row
already renders conditions the fixture carries.

**The fixture is the load the screen is judged against.** The live fight now carries 4
players, 8 creatures and 1 NPC, and between them every state the row draws — active,
unconscious with death saves, defeated, DM-only, four conditions on one row, temporary hit
points. A test asserts all of it, and that the order it ships in matches its own numbers so
the runner never opens by telling a DM their fixture is out of order.

## TC-11b — Acting in combat

**One roll path, one log.** Every roll in a fight — a stat-block action, a character's
longsword, a dice-tray button, a concentration save, a death save — goes through
`useCombatLog`, which uses the same `evaluate` the roll primitive uses. `MonsterSheet`
gained an `onRoll` prop so a sheet opened in a fight logs instead of showing its own local
readout; the same sheet in the library is unchanged.

**The flow is one pass, not a chain.** Attack from the panel, damage from the panel, and if
a combatant is targeted the damage lands on them the moment it is rolled. That is the whole
sequence the prompt names, and there is not a dialog anywhere in it. Targeting is a
crosshair on the row and in the panel header; at most one combatant holds it, because "the
next damage" is singular.

**No approval, and undo names its target.** Hit points move immediately. The last change is
kept as a `HealthChange` carrying what the track read before, so the tray offers
`Undo 12 damage to Goblin #2` rather than a bare arrow — and the undo restores the exact
prior values instead of re-deriving them. There is no global stack a DM can fire blind.

**Corrections are additive.** `RollRepository` has `record` and nothing else: no update, no
delete. An undo appends a correction line rather than rewriting the entry it corrects,
because the log is a history a DM may read back at the end of a session.

**Secret rolls are separated by one predicate, not two lists.** `isPlayerVisibleRoll` is
what the DM's log splits on and what a player device would filter with, and a test asserts
the two answers cannot diverge for any `Visibility`. The secret half renders inside the
hatched DM zone with the words `DM only — not sent to players`, exactly as the design
specifies: the hatch, the violet edge and the sentence all say the same thing, so a DM can
tell from across a table whether what they are about to read aloud was ever visible.

**Concentration is rolled, not queued.** A hit on someone holding it makes the save
immediately, logs it, and drops the condition on a failure. A prompt the DM has to dismiss
is a prompt they start dismissing without reading — and the difficulty, the roll and the
condition key are all the ruleset's, so a system without concentration simply never
returns one.

**Death saves are the adapter's.** `deathSaveRequest`, `applyDeathSave` and the existing
`deathSaveOutcome` mean the screen never knows that a natural 20 gets you up at one hit
point or that a natural 1 costs two failures. `applyHealth` starts a tally when a
*character* reaches zero and marks a *creature* defeated — the design's distinction, and
why the two row states look different.

**The panel repaints on every change.** The context panel keeps whatever JSX it was handed,
so a body built at open time would show the hit points a combatant had when it was opened
and write against that stale fight for the rest of the session. Selection is state; an
effect repaints from the current fight. Same bug class as the encounter builder's, fixed
the same way.

**Runtime writes stay straight through.** No debounce on damage, and still no path from the
combat route to `encounters.save`. Everything TC-10c guaranteed about the template holds.

**What this slice does not do.** Player-facing combat is TC-12: this builds the DM side and
the visibility rule it will rely on. The dice tray's four expressions are fixed rather than
derived from the active combatant's actions — the actions themselves are already rollable
from the panel, and a tray that rebuilt itself every turn would move under the DM's hand.
