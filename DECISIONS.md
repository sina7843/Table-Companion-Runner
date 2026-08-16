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

## TC-11c — History, correction and recovery

**Undo lives on the line it reverses.** Every health change writes a log line and keeps its
`HealthChange` against that line's id, so the log offers `Undo 12 damage to Goblin #3` on
that exact entry. Correcting the change before last is a real thing at a table, and the
design's rule — no global stack a DM fires blind — is satisfied because nothing here is
ambiguous: every offer names its target, and each disappears once used. The tray repeats
only the newest one, so the fastest fix is a reach from the dice that caused it.

**Corrections stay additive.** Undoing appends a correction line rather than deleting the
entry it corrects. `RollRepository` still has no update and no delete.

**Overrides are separate from the rules.** `applyHealth` is a delta a system interprets —
temporary hit points absorb, the value clamps. `overrideHealth` is the DM stating what the
number is, which is a different act and lives under its own `Override` heading in the
panel, below the ordinary control. It is still reversible, and it does not force a
concentration save: stating a number is not a hit. `overrideState` covers what the rules do
not — a creature that surrendered, a character ruled stable.

**Reopening beats restarting.** Ending a fight one click early is a common mistake and the
alternative recovery — start again from the template — throws away every hit point and
condition the fight accumulated. `reopenCombat` puts it back live at the round it stopped
on, with everything intact.

**Connection state is reported, not asserted.** The shell used to render
`<ConnectionStatus state="live" />` unconditionally, which was a lie. `useConnection` reads
two honest signals — the browser's online/offline events and whether the last write
succeeded — and deliberately knows nothing about a transport, because there is not one yet.
Three states, each with a word as well as a colour.

**A failed write says what is still safe.** The banner answers the design's three questions
in order: what happened, that the fight on screen is correct and nothing is lost, and that
`Try again` re-sends exactly what did not land. It never mentions the transport. Coming back
says so once and then stops.

**One flash, not an animation.** A changed row fires the design's 900ms hit-point pass and
nothing loops. A roll happens too often to be an event, and a list that pulses all session
is a list a DM stops reading.

**The log is informative but secondary, which on a tablet means collapsed.** It opens by
default at ≥1280 and collapsed below, because on a 768px-tall screen a third of the height
is the initiative order. Open, it is bounded and scrolls inside itself; `Show all` reveals
the whole history rather than the recent ten.

**The tablet pass, specifically.** Row controls take a 44px touch target below the docked
panel breakpoint; the control bar and the dice tray gain row gaps so wrapping is legible
rather than cramped; and the design's own container query still removes the row cluster when
the column is genuinely too narrow — safe here because everything it does is also in the
context panel, which is the drawer at that width. Turn advance never moves: it is in the
control bar, which wraps but never hides.

**The ended state is an after-action screen.** Rounds, combatants, who is standing, how long
it took, how many rolls, then the participants with their final hit points and the full log
with its DM-only lines marked. Plus the link back to the template, still exactly as prepared.

## TC-12 — The player's combat screen

**One screen, five states, and the shift in emphasis is the design.** Not the player's
turn and it is a monitor: a strip stating the round, who is acting, and `You are next`.
Their turn and the command band *replaces the header* rather than sitting on top of it —
the change is impossible to miss and nothing animates. Down replaces it again with the
danger band, because a player at zero has exactly one thing to do and the screen should say
so before it says anything else.

**The viewer's role is a property of the surface, not the session.** `/play/*` is the
player's device, so it builds a `player` viewer whatever the fixture session says. Reading
the signed-in fixture user's role would have shown this screen the DM's unrevealed
creatures, because that user is the DM. TC-13's auth layer replaces the id; the role does
not move.

**Absent, not hidden.** `playerOrder` runs `visibleParticipants`, so an unrevealed creature
is not a greyed row, not a count and not a gap. A test asserts the player sees exactly the
order minus the DM-only rows and that nothing left behind hints at one. Rolls go through
`visibleRolls`, the same predicate the DM's log splits on.

**One sheet, not a chain of modals.** An attack rolls, the damage rolls with it, and both
land in a single bottom sheet with the outcome and the one action that follows — `Apply 13
damage to Bugbear Chief`, naming the amount and the target in the button. On a miss, or with
no target, the sheet ends at the roll and offers Close. A second tap for the damage roll is
a modal chain by another name, and it is also how damage gets rolled for an attack that
missed.

**The actions are the character's, asked of the ruleset.** `quickActions` flattens
`Ruleset.sheetContent(character, 'actions')` into one button each and drops the damage rolls,
which follow their attack. Four fit a thumb without the order below scrolling away.

**End Turn is in the band and uses the shared transform.** In the band because it must never
sit next to a roll button, and `nextTurn` because the round must move on a wrap exactly once
and a defeated combatant be stepped over identically on both devices. A player ends their own
turn by handing it on; the order itself stays the DM's.

**Damage applies with no DM approval.** The design is explicit, and it is the same
`applyHealth` the DM screen uses, so a monster's hit points are the same number on every
device. Correction is the DM's undo, which already names its target.

**Death saves only exist when the ruleset says they do.** The band, the pips and the roll all
come from `deathSaveRequest` / `applyDeathSave` / `deathSaveOutcome`. A system without them
simply never renders that state — the combat UI is not architected around it.

**Reconnecting says what is safe.** `Reconnecting. Your last roll was saved and the fight is
still running.` No technical detail, no panic, and recovery says so once. The same
`useConnection` the DM shell uses.

**Three new design-system adapters, all over vendored CSS.** `Banner` for a state the whole
screen is in, `DeathSaves` for a tally at thumb size, and `Sheet` for the bottom overlay —
a native `<dialog>` like the others, so the focus trap and Escape come from the platform.

**What is not here.** The bottom-nav badge on the player's turn: the nav lives in the shell
and does not know about the fight, and threading combat state into it for one badge is more
plumbing than the badge is worth until TC-13's realtime channel makes it cheap. Noted rather
than faked.

## TC-13 — Data, persistence and realtime seams

**Greenfield, so the boundary was written rather than integrated with.** There is no
backend in this repository and none was invented. What exists now is the contract a backend
can be written against: `apiContract.ts` states every path and verb in one file, and
`httpRepositories.ts` satisfies the same `Repositories` interface the fixtures do. Nothing
names a vendor, no endpoint has a default, and with nothing configured a fresh clone runs on
fixtures exactly as before.

**One decision, taken once, from configuration.** `createDataSource` reads two public
values — a base URL and a socket URL — and returns the repositories and the channel
together. No screen learns which it got. `VITE_API_BASE_URL` unset means fixtures; that is
the supported way to develop the UI and it is what `npm run dev` does with no env file at
all.

**Nothing in this application reads a credential.** Every `VITE_`-prefixed value is inlined
into the browser bundle by Vite, so `.env.example` says in its own header that a key, token
or connection string may never be named with that prefix. The HTTP client forwards an
`Authorization` header if a host hands it one and never obtains, stores or reads a session
itself. A build with nothing configured inlines an empty object — verified against `dist`.

**The domain barrel no longer exports `CURRENT_USER_ID`.** That single export was the hard
coupling: eleven screens imported the signed-in user straight out of the demo data. They now
call `useUserId()`, which reads `users.current()` through the repository — fixtures answer
with the fixture user, a deployment answers with whoever holds the cookie. Removing the
export is what keeps it removed, and a test asserts both that it is gone and that no file
under `screens/` or `app/` imports fixture data at all.

**Events are notifications, not payloads.** A `DomainEvent` says a thing changed and who
changed it; the receiver re-reads through the repository. Shipping new state in the event
would mean two sources of truth and a merge problem the first time two devices wrote at
once. It also means a secret roll can announce itself safely: the event carries no total and
no visibility, and the DM-only rule stays where it already was.

**`withRealtime` wraps any implementation.** Announcing a write is a decorator over
`Repositories`, so the fixture layer and the HTTP layer announce identically and neither has
to remember to. That is the failure mode it exists to remove.

**The local channel is a real channel, not a pretend one.** `BroadcastChannel` genuinely
keeps a DM tab and a player tab in step on one machine, which makes the seam something that
works today rather than something that type-checks. `createSocketChannel` is the production
path and is constructed only when a URL is configured — a socket is a platform API, and
choosing a provider belongs to whoever deploys this.

**The write policy is stated once, in the contract.** Every write is idempotent, which is
what makes a debounce and a retry safe anywhere above the repository. Autosave belongs to
the screen — the encounter builder debounces and flushes, combat deliberately does not
debounce at all. Optimism is allowed where local state is already authoritative and the
write is idempotent (combat, encounter editing) and refused where the server mints an id
(`create`, `duplicate`, `cloneFrom`, `startFromTemplate`), because a caller cannot
optimistically know a key it did not generate.

**Reconnect is two signals, honestly combined.** `useConnection` already read the browser's
online/offline events; it now also reads the channel's own status, because a socket knows it
has dropped before the browser notices. With the local channel that reduces to the
online/offline events, which is the honest answer when nothing is deployed.

**A React-shaped bug fixed on the way.** `useRealtime` matched wanted event kinds by
substring over a joined string, which would fire a handler for any kind that happened to be
a prefix of a wanted one. It matches whole values now.

## TC-14 — Responsive, accessibility and input pass

**Every fix went into the adapter layer, not the vendored CSS.** The approved design system
is the visual contract; `adapters.css` already existed for exactly this — structural and
affordance corrections that introduce no colour, type, spacing or shape of their own. Four
of the five fixes are there, and each one states in a comment what it is answering.

**The hover-only reveal was the acceptance criterion, and it was real.** `.tc-table__rowactions`
ships at `opacity: 0` until the row is hovered or focused. On a pointer that is a considered
reveal; on the DM's tablet there is no hover state to enter, so Start combat, Duplicate and
the overflow menu were invisible and unreachable without a keyboard — on the encounter
library and the monster library both. The escape is `@media (hover: none)`, which asks the
device rather than the viewport: a laptop with a touchscreen keeps the reveal because it
still has a pointer, and a wide tablet loses it because it does not. A width query would
have got both cases backwards. `.tc-action__rolls` had the same shape at lower stakes and
got the same treatment.

**The bottom sheet was shipping with browser styling over it.** `Sheet` arrived in TC-12 as
a native `<dialog>` but was never added to the user-agent reset that `Modal` and `Drawer`
have, so it rendered with the UA's padding, groove border, canvas background and
`max-height`, and with no scrim behind it at all. A test now derives the list of overlay
classes from `Overlay.tsx` itself, so the next dialog cannot be added without one.

**A long name broke the initiative row.** `.tc-init__name` sets `overflow: hidden` and
`text-overflow: ellipsis`, but it is a flex container — `text-overflow` does not reach a
flex child, and the name became a `<button>` in TC-11a so that it could carry the keyboard
path. Without `min-width: 0` it refused to shrink, and a long creature name pushed the state
flag and the initiative column out of the row.

**There were no headings anywhere.** Every page title was a `<span class="tc-topbar__title">`
and every section title a `<span class="tc-section__title">` — one `<h3>` in the whole
application. A screen-reader user had no structure to navigate at all. Page titles are now
`<h1>`, `SectionHeader` renders `h2`/`h3` (a sub-section defaults one level deeper) with an
overridable `level`, and `EmptyState`'s title is an `<h2>` because on an empty screen it is
usually the only thing there. The user agent's heading margins and font sizes are zeroed in
`shell.css` so the approved type scale is untouched — which is why the semantics could not
be added before that reset existed.

**What was already right, and was checked rather than assumed.** The global focus ring in
`base.css` covers `a`, `button`, `input`, `select`, `textarea` and `[tabindex]`, which is
every focusable thing this application renders. `touch-targets.css` from TC-01 already
enforces the 44px floor at touch density, including expanded hit areas for controls too
small to grow. Both shells have a `main` landmark and a skip link; `Sidebar` and `BottomNav`
are `nav` elements with names. Reduced motion zeroes the duration tokens and switches off
the three looping animations by name. Every state that carries a colour also carries a word
— `Turn`, `Down`, `Out`, `Live`, `Reconnecting`, `Offline`, and every difficulty badge.

**The monster editor now wraps instead of squeezing.** Its preview column was `flex: none;
width: 400`, which on a tablet took 400px of a 968px workspace away from the fields a DM is
typing into. It is `flex: 1 1 340px` with a wrap, matching what the encounter detail and
builder already do.

**The pass is pinned by a test that bites.** `accessibility.test.ts` derives what it checks
from the source rather than restating it: the hover check enumerates every `opacity: 0` rule
in the vendored CSS, finds the ones a `:hover` selector reveals, and requires each to have a
`hover: none` escape. Removing the fix fails it — verified by removing the fix. The same
shape covers overlay resets, looping animations, headings, landmarks, focus return and the
colour-plus-word maps. Twelve checks, none of which need a browser, which is what makes them
runnable in this project at all.

**What a static check cannot answer.** Contrast ratios, real focus order through a rendered
tree, and whether a 44px target is actually comfortable under a thumb are all measurements
this repository has no way to take — there is no browser automation installed. The tokens
were designed against the approved palette and the floors are enforced in CSS, but none of
that is the same as having measured it, and this pass does not claim to have.

## TC-15 — Design fidelity audit

**The vendored CSS was diffed against the source, not assumed to match.** Token values were
read back through `claude_design` MCP and compared declaration by declaration: the type
ramp, the semantic `-text` steps, the tracking, the breakpoints, the frame proportions, and
all three density blocks. Every compared value is identical to the approved system. One
early "drift" report was my own comparison script matching double-quoted selectors against a
file Prettier had normalised to single quotes — the code was right and the audit tool was
wrong, which is worth recording because it is the failure mode a fidelity check has.

**Off-ramp type sizes are the design's own, and were kept.** Seven sizes in the screens are
not on the token ramp — 26px on a builder step title, 28px on the live-combat band, then 22,
20, 19, 14.5 and 12.5. Each one was traced back to the approved canvas and matches it
exactly, down to the accompanying `font-family`, `font-weight` and `letter-spacing`.
Normalising them onto the ramp would have *reduced* fidelity, so they stay. The list is
closed and enforced: a size that is neither on the ramp nor in that list now fails a test,
because a new number there is a decision rather than a detail.

**One real token-usage miss, found by the check rather than by eye.** The privacy screen set
`fontSize: 12` as a bare number where `--font-size-12` holds that exact value. It now uses
the token.

**Three magic numbers in the application layer replaced with the tokens holding them.** The
combat control bar's 40px is `--layout-toolbar-height`, which is the number the design's own
Extension 1 asked for; the tablet control bump is `--density-control-height-lg` rather than a
literal 40; the player's dice grid is `--density-control-height`, which at touch density is
the 52px the design draws. Same rendering, but the frame now moves when the system moves.

**The tablet control bump is deliberately 40px, not the 44px touch floor.** The DM's tablet
runs at comfortable density because it is still their workspace; flooring its row controls to
the touch minimum would loosen a row the design deliberately keeps dense. It grows to the
system's own large-control step instead, which is what that token is for.

**`FLASH_MS` restates `--duration-flash` and says so.** A `setTimeout` cannot read a custom
property, so the 900ms realtime highlight is written twice. The constant names the token it
mirrors, and a test asserts both that 900ms is still the longest thing the design animates
and that the runner still points at it.

### Intentional deviations from the approved design

These are choices where the implementation knowingly differs. Each was made once, for a
stated reason, and each is the smallest departure that solves the problem.

1. **Row actions are revealed on hover-less devices** (TC-14). The approved CSS hides them
   until hover. On a touch screen that state cannot be entered, so Start combat, Duplicate
   and the overflow menu were unreachable. Opacity only, under `@media (hover: none)`; the
   pointer experience is untouched.
2. **`InitiativeRow` is a `div` whose name is the button**, not a `button` (TC-11a). The
   design's CSS resets the row like a button, but the row carries controls, and a control
   inside a control is invalid markup whose inner control never reaches the keyboard.
3. **Titles are real headings** (TC-14). The design's canvas draws them as `span`s. The type
   is identical — user-agent heading styling is zeroed — but the document now has a
   structure a screen reader can navigate.
4. **Encounter location is a text field with a datalist, not a `Select`** (TC-10). A DM
   naming a new room has to be able to type one; a closed list is a dead end.
5. **Explicit "open" buttons instead of clickable rows containing buttons** (TC-08a, TC-10).
   Same reason as 2, and it keeps the design's stated click count.
6. **No "Group identical" expand toggle** (TC-10). Grouping is the only state with data
   behind it; an expanded view would render N identical rows with nothing per-creature to
   edit until combat instances carry per-participant state.
7. **The dice tray's four expressions are fixed** (TC-11b). A tray that rebuilt itself every
   turn would move under the DM's hand; the actions themselves are already rollable from the
   panel.
8. **Encounter difficulty is computed, never stored** (TC-09). The design states it against
   the current party, which a stored label cannot stay true to.

**What this audit could not do.** It compares source against source. Nothing here rendered a
route and measured it, because there is no browser automation in this repository — so
"visibly belongs to the approved design system" is argued from tokens, structure and the
design's own stated rules, not from a screenshot. That limit is real and is not being
dressed up.

## TC-16 — Testing, performance and edge cases

**Coverage was measured, not estimated.** A script parsed the `Ruleset` interface and
checked every method name against every test file. Thirty-five methods, three of them
untouched: `deriveMonster`, `initiativeRequest` and `levelUpStepForm`. All three now have
tests, and the measurement itself is now a test — a new method on the seam with no coverage
fails the suite. Mutation-verified by adding a method and watching it fail.

**A second contract test asserts every registered adapter implements the whole seam**,
including the three non-method members. That one also fails on the same mutation, which is
what makes the pair worth having: one catches an untested method, the other an unimplemented
one.

**One test was wrong, not the code.** The level-up assertion required every step form to
have fields; the `review` step is a summary and correctly has none. Fixed the assertion, and
replaced it with the thing actually worth pinning — that at least one step asks something,
because a level-up flow that asks nothing is not a flow.

**The bundle was one 620kB chunk and is now 418kB plus per-route pieces.** Everything was
imported eagerly, which meant a player opening their phone at the table downloaded the
monster library, the encounter builder and the entire DM surface before their own combat
screen could render. Routes are `lazy` now; the player's combat screen is an 11kB chunk. The
Vite size warning is gone. Two things made this safe rather than fiddly: each shell's
`Outlet` needed its own `Suspense` boundary — the existing one sits inside `DMPage`, below
the route, and would never have seen it suspend — and the fallback is the `RouteLoading`
skeleton the design already specifies, so nothing new appears on screen. The shells stay
eager: a frame that flashes is worse than a frame that costs a few kilobytes.

**Two real recomputations in the combat surface, both fixed.** `armourOf` called
`deriveCharacter` per row per render — thirteen full derived-block recomputations on every
keystroke, for a number that cannot change during a fight; it is a `useMemo` keyed by
participant now. `useCombatLog` re-filtered the whole log into two arrays on every render
and returned fresh identities each time, which also defeated any memo downstream; both
halves are memoised in one pass.

**List keys were checked and left alone.** Every `key={index}` in the codebase is over a
fixed positional array — death-save pips, spell-slot pips, the dice inside one roll
breakdown, skeleton rows. For those the index *is* the identity, and a generated key would
be worse. Nothing dynamic uses one.

**Hydration is not applicable and is not pretended to be.** This is a client-rendered Vite
application with no SSR and no server-rendered markup to mismatch. There is nothing to test
and no warning to chase.

**What the test stack can and cannot do, stated plainly.** There is no DOM environment and
no browser automation here — `node --test` with type stripping is the whole harness. So the
hook-shaped requirements are covered at the level the stack supports: the connection tests
exercise the real channel implementations for subscribe, unsubscribe and status, and then
assert the *rules* `useConnection` is built from by reading its source. That catches a rule
being deleted; it does not catch a rule being mis-wired in a render. The same limit applies
to the responsive checks, which verify the breakpoints, the density switch, the panel's two
forms and the container-query opt-in, but never measure a rendered layout. Where a check is
source-shaped rather than behavioural, it says so in its own file header.

### The manual checks this leaves

These are the Phase 1 interactions no automated check in this repository covers, listed so
they are documented rather than assumed:

- Rendered focus order through a real tab pass on each shell.
- Contrast ratios against the approved palette.
- Whether a 44px target is comfortable under an actual thumb.
- The docked-panel-to-drawer transition as it actually reflows at 1280px.
- The 900ms hit-point flash as seen, and reduced motion as actually honoured by a browser.
- Two devices genuinely in step over the local channel — the transform is tested, the
  cross-tab delivery is not.

---

## TC-17 — Phase 1 audit and handoff

**Six routes were rendering a permanent loading skeleton, and that is a lie.** `DMCharacters`,
`DMSpells`, `DMItems`, `PlayerDice`, `PlayerParty` and `PlayerCharacters` each rendered a
`SectionHeader` plus a `Skeleton` with nothing behind it. The file header claimed "Nothing here
renders a disabled future feature", which was true and beside the point: a skeleton that never
resolves does not read as a disabled feature, it reads as an app that is still loading. Every one
was resolved rather than left, in one of two ways.

**Four were built, because the data was already there.** `PlayerCharacters` is
`characters.listForOwner`. `PlayerParty` is the owner's campaign roster plus `users.byIds`.
`DMCharacters` is every campaign the DM owns, grouped, reusing the campaign Party tab's own
table — `PartyTable` was made exported rather than copied, so a column added to the party table
appears in both. `PlayerDice` is `useRoller` over a die grid. None of these needed a new
repository method, a new component or a new type; they needed the call that was missing.

**Two were removed, because Phase 1 has no content for them.** The approved design's DM sidebar
lists Spells (318) and Items (96) under Library. `Requirements.md` §18.1 does not place them in
the Phase 1 information architecture, and the source precedence in `CLAUDE.md` puts Requirements
above the design. There is no ingested spell or item data and no prompt introduced any, so a
built screen would have been an empty list behind a nav entry that promised 414 things. Route and
sidebar entry are both gone. This is the only place the implemented navigation is narrower than
the approved design, and it is deliberate.

**The rule is now enforced rather than stated.** `src/app/routes.test.ts` asserts that every
sidebar and bottom-bar destination resolves to a declared route, that the bottom bar holds at
most five entries, and that no routed screen renders a `PendingSection`. The first check was
mutation-verified by pointing a nav entry at the removed `/dm/spells` — it fails, as it should.
Without it, removing a route silently leaves the sidebar pointing at a "not found".

**My characters is reached from Home, not from the bottom bar.** `/play/characters` existed as a
route with nothing linking to it. The design's bottom bar is five items and a sixth pushes the
row below a comfortable touch target, so the Home screen's "Your character" header grows an
"All N" action when the player owns more than one. A player with exactly one character is not
offered a list of one.

**`/dev/showcase` stays.** It is dead weight in the product sense — no route links to it and it
ships as its own 12 kB chunk. It is also the fidelity surface TC-15 audits against and the only
place every primitive renders at once under live theme and density switches. Deleting it would
save a chunk nobody downloads and lose the check.

**Three Phase 1 scope items are not finished, and the documents say so.** Authentication has
identity but no credentials. Realtime has the seam, the local channel and the socket client but
no server — TC-13 forbade choosing a provider requiring credentials, so this is by instruction,
not by omission. The 5e.tools ingest does not exist; the monster library reads real SRD stat
blocks that were hand-authored into the ingest shape. All three are in `PROJECT_STATUS.md` and
`REQUIREMENTS_TRACEABILITY.md` with the reason attached. None is a defect in what was built;
each is a part of §6 that no prompt in the sequence covered.

**`PROJECT_STATUS.md` and `REQUIREMENTS_TRACEABILITY.md` had drifted badly.** The first still
said the active item was TC-06 and the last completed was TC-03, twelve prompts after that
stopped being true. The second was a three-line stub. Both are now written from the code rather
than from memory, and every file path in the traceability table was checked to exist — three
were wrong on the first pass (`domain/sheet.ts`, `domain/library.ts`, `domain/homebrew.ts` are
all somewhere else) and are corrected.

---

## TC-P00 — Production architecture decisions

The active prompt asks for architecture decisions to be recorded in `IMPLEMENTATION_DECISIONS.md`
before implementation. That file is protected by `.claude/hooks/protect-files.mjs` and refuses an
automated edit, which is correct — it is the approved decision record and should change by hand.
The decisions are therefore recorded here, in the file whose own header says to append
implementation decisions when the active prompt requires one. If they are to be promoted into
`IMPLEMENTATION_DECISIONS.md` as items 19–29, that is a manual edit for the user to make; nothing
below contradicts items 1–18.

**Decision P1: the server is the authority.** The client is a view and an editor, never a decider.
Every permission, every combat mutation, every dice result and every id is settled server-side.
`src/domain/permissions.ts` keeps its header saying it is a UI guard and gains a server twin
rather than being promoted into one. The evidence this closes: a player's device currently
evaluates its own visibility rules over a payload that already contains the DM's secrets.

**Decision P2: the backend is Node + TypeScript, in this repository.** It implements
`src/domain/data/apiContract.ts` and shares `src/domain/types.ts` as the wire format. That is the
contract's own rule — reads return domain shapes verbatim, and a second DTO shape is a second
place for the two to drift. It also lets the server run the *same* pure transforms the client
already has (`turns.ts`, `actions.ts`, `setup.ts`, the ruleset adapters) instead of a second
implementation of the rules, which is the failure mode that makes authoritative servers expensive.
A separate language or repository buys nothing here and costs the shared domain model.

This is an addition, not the framework rewrite `IMPLEMENTATION_DECISIONS.md` #17 forbids. The
existing frontend, design system, domain model and ruleset abstractions are preserved unchanged.

**Decision P3: PostgreSQL, owned solely by the server.** Versioned migrations, applied by the
server's own runner. No client holds a connection string and no `VITE_*` variable names one —
Vite inlines those into the browser bundle, so that is a hard rule, not a preference. Fixtures are
demoted to an explicit development mode and are never production storage.

**Decision P4: ruleset-specific data stays in JSONB.** `systemData`, `attributes`, `actionGroups`
and the other opaque bags are stored as JSON, so no D&D column reaches a generic table. This is
`IMPLEMENTATION_DECISIONS.md` #1 carried into the schema: D&D 5e is the first ruleset, not the
database. The boundary test that walks every source file has no equivalent in SQL, so the rule
has to be a decision rather than an assertion.

**Decision P5: ingested library content is a separate ownership boundary from user campaign
data** — separate tables and separate write paths, so an ingest run cannot touch a campaign. This
is #6 in the approved decisions, and `repositories.ts` already splits the interfaces this way; the
store must match.

**Decision P6: authentication is an httpOnly, SameSite session cookie issued by the server.** A
bearer token cannot live in a `VITE_*` variable for the reason in P3, and the client already
declines to obtain or store a credential — `ApiConfig.authorization` exists only to forward what a
host hands it, and that stays true. Note the consequence: `httpRepositories.ts` sends
`credentials: 'same-origin'`, so a cross-origin API needs that line changed and CORS configured.
That must be a deliberate decision in TC-P02, not something discovered when the first request
arrives without a cookie.

**Decision P7: authorization filters before delivery, not after.** A player's request and a
player's socket must not receive `dm-only` participants, unrevealed creatures, secret rolls or
hidden character sections at all. Filtering on the receiving device is a rendering decision, and a
rendering decision is not a security boundary — the unrevealed Cragmaw Ambusher is currently
absent from the player's *rendered list* while sitting in the player's *network response*.

**Decision P8: combat moves off whole-record writes; single-writer documents keep them.** The
idempotent full-record `PUT` policy in `repositories.ts` is correct where one client owns the
document under autosave — encounters, monsters, drafts — and it stands. Combat has two writers,
today with no version and no `If-Match`, and a player's device `PUT`s the entire fight including
everyone's hit points and the hidden roster. Combat therefore needs intent-shaped mutations plus a
server-checked version, so a stale or unentitled client is rejected rather than silently winning.

This is the largest client-visible change in the sequence. It belongs in TC-P04 as one deliberate
change, not smeared across the earlier prompts.

**Decision P9: runtime validation at both edges, from one shared schema.** Request bodies are
validated at the server edge and response bodies at the client edge, replacing
`return (await response.json()) as T`. A TypeScript type is erased at runtime; a cast is a claim,
not a check.

**Decision P10: realtime stays notification-shaped.** Events say what changed and the receiver
re-reads through the repository; they never carry state. That property is why a stale event
cannot write stale data, and it survives a real server unchanged — so the seam is kept and the
server is added behind it. The server owns the socket, scopes fan-out per campaign, stamps
`origin` itself rather than trusting a client string, and applies the same per-viewer filtering as
P7.

**Decision P11: production readiness is claimed only by the Golden Path**, run against real
persistence with at least two independent authenticated clients. A passing test suite, a working
fixture flow or a rendered screen is not evidence of production readiness for any capability. The
TC-P00 baseline is a live demonstration of the distinction: 241 tests pass, every check is green,
and zero capabilities are production-backed.

---

## TC-P01 — Backend and PostgreSQL foundation

**No web framework.** `node:http` plus a forty-line matcher. The API surface is 40 routes
enumerated in `apiContract.ts`, with no middleware stack, no content negotiation, no template
engine and no file uploads — so Express or Fastify would be a dependency bought for a route
matcher and a JSON writer. This repository already declined a state library, a data-fetching
library, a CSS framework and a test framework on exactly that reasoning, and the argument does
not get weaker on the server. The cost is owning `matchRoute`, which is one function with six
tests, one of which asserts the table's order carries no meaning.

The two things a framework would have given that are worth naming: a body-size limit and a
consistent error shape. Both are in `http.ts`, deliberately, in about fifteen lines.

**No ORM and no migration tool.** Migrations are `.sql` files applied in filename order inside
one transaction each and recorded by name — thirty lines in `migrate.ts`. An ORM would also have
meant a second definition of every entity, when the whole point of the contract's "reads return
domain shapes verbatim" rule is that there is exactly one. The store writes SQL and maps rows;
what reaches the database is what is written in the file.

**`pg` is the one new runtime dependency.** Node has no PostgreSQL client and the wire protocol
is not something to hand-roll. It is imported in one file.

**The server shares `src/domain/types.ts` rather than restating it.** `apiContract.ts` states
that the domain types *are* the wire format and that a DTO layer would be a second place for the
two to drift. Putting the backend in this repository is what makes that true rather than
aspirational — and it lets the server run the same pure transforms and ruleset adapters the
client already has when TC-P04 makes it authoritative, instead of a second implementation of the
rules that has to be kept in step.

**Promoted columns for what the server constrains; JSONB for everything else.** The rule applied
per column was: does the server need to constrain, own, join or filter on this? Ids, ownership,
campaign membership, status, round, origin and challenge rank are columns. `attributes`,
`systemData`, `actionGroups`, `derived`, `facets`, builder `choices` and an encounter's roster
are JSONB. `domain.test.ts` walks every source file to keep D&D out of the core; there is no
equivalent test for SQL, so this had to be a decision that the schema then documents in place.

**`combat_participants` is a table now, written as a set.** The current contract is a whole-record
`PUT`, so the store deletes and re-inserts the roster inside one transaction. Storing the roster
as JSON on the combat would have been less code today and a migration under a live product
tomorrow, because TC-P04 has to authorize and update one participant at a time. The table is the
cheap half of that change made early; the write pattern is the half that waits.

**`combats.version` is maintained and not checked.** Incrementing it costs nothing and means
TC-P04 inherits a column with a true value in every row rather than a backfill. Checking it is a
contract change — a client that sends a stale version has to be told, and both combat screens
have to handle being told — and that belongs in the prompt that owns concurrency, not smeared
into this one.

**`combat_events` is written from the first day.** A history table nothing writes to is a table
nobody has tested. One row per fight write, in the same transaction as the write, keeps it honest
and gives TC-P05's reconnect-recovery something real to read.

**Same-origin in development, via the Vite proxy, rather than CORS.** `httpRepositories.ts` sends
`credentials: 'same-origin'`. Configuring CORS would have meant changing that line and then
changing it back when TC-P02 introduces a SameSite session cookie, which only travels on a
same-site request anyway. Proxying `/api` from the dev server is four lines in `vite.config.ts`,
needs no CORS code at all, and is the shape authentication already wants. TC-P00 listed this as a
decision to take deliberately rather than discover on the first cookie-less request.

**The fixtures stay, and stop being storage.** `createFixtureRepositories` is untouched: an
unconfigured `npm run dev` still runs the whole UI with no server, which is what makes the design
work reviewable on its own. What changed is its status in the documents, and that the same world
is now loadable into PostgreSQL as development data. The seed is insert-only on every statement —
no delete, no truncate, no reset — because a developer running `npm run db:seed` twice must not
lose what they were working on.

**Library monsters are inserted only by the seed, and the database enforces it.** A check
constraint refuses a library row with an owner, and the store's `create` and `save` always write
homebrew. Requirement §6.6 says ingestion must stay isolated from user campaign data;
`repositories.ts` split the interfaces, and this is the same split where it can actually be
enforced.

**Integration tests build their own schema.** `tc_test` is dropped and recreated at the start of
the run, which is the only destructive statement anywhere in the repository and can only ever
reach a schema these tests own. With `DATABASE_URL` unset all eighteen skip, so the suite stays
green on a machine with no database — a test that cannot run must say so rather than fail.

**A dropped connection is logged, not thrown.** Found by restarting PostgreSQL under a running
server and watching the process die: `pg` reports a dropped idle client as an `error` event on
the pool, and an unhandled one is an uncaught exception. A database restart must not be an API
outage. This is the one place in this slice where the lazy version was wrong.

---

## TC-P02 — Authentication and server authorization

**Sessions are opaque cookies, not JWTs.** A session is 32 random bytes; the database stores its
SHA-256 and the browser holds the original in an `HttpOnly`, `SameSite=Strict` cookie. A JWT
would have bought statelessness and cost the ability to revoke — and revocation is the operation
this product actually needs, because "sign out" and "change your password" both mean *end that
session now*. Looking a token up is one indexed read on a request that is already going to the
database. Nothing in the browser bundle can read the cookie, so there is no client-side token to
store, refresh, or leak into a log.

**Sliding expiry, no refresh endpoint.** `GET /me` is what every screen already calls to learn
who it is serving, and answering it is where the session gets renewed. A separate refresh call
is a call a client can forget to make. The row is touched at most once a day rather than once a
request, because a write per read is how a session table becomes the hottest table in the
database.

**scrypt from `node:crypto`, not bcrypt or argon2.** Both would be dependencies for a KDF the
standard library already ships, with a memory-hard construction and a constant-time comparison
beside it. The digest stores its own parameters, so raising the cost later does not invalidate
anybody's password.

**A wrong password and an unknown address are the same answer, and take the same time.** The
unknown-address path deliberately burns a real scrypt verification against a throwaway hash.
Without it, the two answers differ by two orders of magnitude in latency and the sign-in form is
a list of who has an account here. Sign-*up* does still say when an address is taken, because a
sign-up form that cannot say so is unusable; the real fix is email verification and it is
TC-P07's.

**Authorization is one wrapper, not forty checks.** `createAuthorizedRepositories` decorates the
store with the caller's identity, and `http.ts` hands a route handler nothing else. The
alternative — a check at the top of each handler — is forty places to be right and one place to
be wrong, and the wrong one is invisible in review because it is an absence. This is the shape
`withRealtime.ts` already uses on the client for a different concern, so it is not a new idea in
this codebase either.

The route table did not change. That is the test of whether the seam was in the right place.

**A signed-out caller gets a proxy that refuses everything.** Rather than a hand-written object
of rejections, so a repository added later is refused by having said nothing. Same reasoning as
`Route.anonymous`: the default is closed, and staying closed should not require remembering.

**Filtering happens before serialisation, using the client's own rules module.** The server
imports `src/domain/permissions.ts` — the file whose header used to say it was not a security
boundary. It still is not: the client's copy decides what to *draw*. But there is exactly one
statement of "what is a secret roll", and both sides read it. A second predicate is precisely
how these things leak, and this is the arrangement where a second one cannot quietly appear.

**Where the contract says `T | null`, a forbidden record reads as `null`.** Not 403. A 403 on
`GET /campaigns/:id` confirms the campaign exists, which is a slow enumeration of the whole
database. `null` is indistinguishable from "no such record", so probing ids tells an attacker
nothing at all. Lists and writes still answer 403, because there is nothing to be coy about.

**Character redaction is coarse, and marked.** `sectionVisibility` hides *tabs*, but the data
behind them lives in `systemData`, a bag the core deliberately cannot interpret. So hiding one
ruleset-backed section drops the whole bag rather than part of it. That over-redacts: a
party-mate who hides their inventory shows co-players only the always-shared block. Precise
redaction needs a `Ruleset.redactCharacter(character, hidden)` seam, because only the adapter
knows which keys feed which section — and adding a seam method mid-security-slice is how a
security slice becomes a refactor. No player screen reads another player's ruleset data today,
so the cost is currently zero and the note is in the file.

**Player combat writes are judged as a diff.** The contract is still a whole-record `PUT` until
TC-P04, so the server cannot ask what the client *meant* — only what it *changed*. The policy is
deliberately blunt and refuses on the first thing a player may not touch: a refusal costs a
player one action they can repeat, a missing check costs the table the fight.

Two things fell out of writing it that are worth recording, because both were bugs the first
time:

1. The player's copy of a fight legitimately omits the combatants they cannot see. So the
   submitted roster is compared against *what that viewer was shown*, not against the stored
   one — and a mismatch is refused rather than merged away.
2. The policy must judge what the client **claimed**, not a version already trimmed back to
   what is allowed. Trimming first turns every refusal into a silent no-op that answers 200,
   which is worse than either allowing or refusing: the client believes it succeeded.

**No CORS, on purpose.** The topology is same-origin — Vite proxies `/api` in development and a
deployment serves both from one origin — so there is no cross-origin caller to permit, and the
safest CORS configuration is the one that does not exist. CSRF is handled by `SameSite=Strict`
(the browser never attaches the cookie cross-site at all) plus a `Sec-Fetch-Site` check with an
`Origin` allowlist behind it. `TC_ALLOWED_ORIGINS` refuses `*` at startup, because there is no
such thing as a safe wildcard beside a credentialed cookie.

**`TC_DEV_USER_ID` is refused rather than ignored.** It was TC-P01's shim and TC-P02 replaced
it. Silently ignoring it would leave a deployment believing it had configured something; the
server now fails to start and says what to do instead.

**No account-creation screen was invented.** `POST /auth/sign-up` exists, is tested, and no
Phase 1 surface calls it — the approved design draws sign-in and join-by-invite and nothing
else, and TC-P07 owns account lifecycle. Building a screen the design does not have, inside the
prompt that was asked for authentication, is how a sequence stops being reviewable.

---

## TC-P03 — API contract runtime validation and hardening

**Hand-written combinators, not a validation dependency.** Zod would have been the obvious
answer and it is a real dependency with a large surface, a version to track and a bundle cost on
a client that already ships to a phone. What is actually needed is a few dozen fixed shapes with
bounds, and that is two hundred lines with no transitive anything. The rule stated in the file
is the one that keeps it honest: it is not a general-purpose validation library and must not
grow into one — if a schema needs something these cannot express, the shape is probably wrong.

**The schemas live in `src/domain/data/`, not in `server/`.** The client validates responses and
the server validates requests, and they are the same shapes. A second schema module would be a
second place to drift, which is precisely the argument that made `types.ts` the wire format
rather than introducing a DTO layer.

**Requests strict, responses lenient.** The asymmetry is deliberate and it is not Postel's law
being invoked as a slogan. A strict request refuses an over-post, which is how a field nobody
meant to accept gets written; there is no cost to refusing, because a well-behaved client never
sends one. A strict *response* would mean a server one deploy ahead of a browser tab breaks that
tab over a field it does not use — a self-inflicted outage during every rollout. So an unknown
response key is dropped.

The property both rely on is the same: the validated object is rebuilt key by key from the
schema, so an unknown key cannot survive even where it was not an error. That is what lets
`ctx.body` be trusted by a route handler without a second check.

**Nothing security-sensitive is coerced.** `visibility` and `origin` are checked as values, and
a value outside the set is refused rather than defaulted to the safe one — a default is a
decision made silently, and the caller should be told they sent something meaningless. Passwords
are bounded and otherwise untouched: not trimmed, not normalised, not lower-cased. The only safe
transformation of a secret is none.

**Error codes are the contract; messages are not.** A screen that branches on a failure branches
on `code`. That is what lets the sentence be improved, translated or reworded without breaking a
caller, and it is why there are nine codes rather than thirty — a code exists when a caller could
reasonably do something different because of it, and everything else is `internal`.

`details` names fields and never values. A validation message that quotes what it rejected will
eventually quote a password into an error a user pastes into a support ticket.

**A record you may not have reads as `null`, not `403`.** Kept from TC-P02 and worth restating
now that there is a code for everything: a 403 on `GET /campaigns/:id` confirms the campaign
exists, and that is a slow enumeration of the database. Lists and writes answer 403 because
there is nothing to be coy about there.

**Logs carry the route pattern, never the path.** `/campaigns/:campaignId` tells an operator
everything they need. The resolved path carries an id, an invite code or a search term, and a
log file is the least controlled copy of any of those. The same reasoning excludes the query
string and the body outright rather than trying to redact them field by field — a redaction list
is a list somebody forgets to extend.

**Rate limits are keyed by account first, address second.** Keying only by address throttles
everyone behind one hotel network together and does nothing about a botnet that has already
signed in. Keying only by account cannot protect sign-in, which has no account yet. Both, chosen
by whether there is a session, is the one that holds in both directions.

Fixed window rather than sliding: a caller can spend two windows' worth of requests across a
boundary, and for "stop credential stuffing and runaway retries" that does not matter. A sliding
log would fix it and cost a timestamp array per key.

**In-memory, and said so in the file.** Per-process counters are wrong the moment there are two
processes. That is a real ceiling with a known fix — a shared counter — and it belongs with the
horizontal-scaling work rather than as speculative infrastructure built before there is a second
instance to need it.

**`monsters.list` is capped even when no limit was asked for.** An unpaged list endpoint is one
whose cost is decided by whoever calls it. The cap is visible rather than silent because
`monsters.count` stays unbounded and the library screen already prints "N of M" from it — so a
truncated page shows up as a number that does not match, not as a list that quietly ends.

**Roll idempotency distinguishes a retry from a collision by comparing the payload.** TC-P01
re-minted every colliding id, which is right for two devices whose per-page counters produced
the same id and wrong for one device resending a roll whose response it never saw. The two are
indistinguishable by id alone and need opposite answers, so the identifying fields decide:
same bytes is a retry and returns what is stored; different bytes is a collision and is kept.

An `Idempotency-Key` header is the general solution and was not built. Nothing in this client
retries a `POST` — `repositories.ts` tells callers to wait — so it would be a mechanism with no
caller, and TC-P04 removes the collision case entirely by minting ids server-side.

**Cross-origin is a switch that refuses to be half-set.** The topology is same-origin and the
default emits no CORS header at all, which is the only CORS configuration that cannot be got
wrong. Turning it on requires an explicit origin allowlist and forces `SameSite=None`; browsers
only accept that with `Secure`, so the server refuses the combination outside production at
startup. Discovering that in a browser, as an unexplained missing cookie, is the failure this
avoids.

**A refused upload closes the connection.** Found by sending two megabytes and watching the next
request fail with `ECONNRESET`: stopping mid-body leaves bytes in the socket that belong to a
request nobody will answer, and the next one on a kept-alive connection is parsed out of them.
`Connection: close` is the only correct end to a body we declined to read.

**The client now reads the server's sentence.** `httpRepositories` was synthesising
"POST /auth/sign-in failed (401)." and discarding what the server actually said — which meant the
sign-in screen shipped in TC-P02 would have shown that to a user. Reading the error body was part
of this slice rather than a separate fix, because a stable error contract that nobody reads is
not a contract.
