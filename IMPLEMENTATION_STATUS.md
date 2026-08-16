# Table Companion — Implementation status

Use `PROJECT_STATUS.md` as the execution checklist. Record concise implementation notes here when useful.

---

## TC-00 — Implementation map from the approved design source

Built from the Claude Design project imported over the `claude_design` MCP: `Table Companion
Phase 1 - Part 4.dc.html` read in full (843 lines), all 20 listed design-system imports, and
`support.js`. Part 4 also carries the closing screen inventory for Parts 1–3, so the screen list
below covers all 35 approved screens even though only Part 4 was read in full.

### Screen inventory — 35 screens across 4 documents

| Group                              | Screens                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Part 1 — DM combat                 | Live combat desktop · initiative row states · before combat begins · secret roll and undo · combat log · dice tray · context panel · live combat tablet                                            |
| Part 2 — Player                    | Player home · my characters · empty state · character sheet mobile · spell sheet · privacy controls · combat waiting · your turn · attack resolved · unconscious and death saves · reconnecting · character sheet desktop |
| Part 3 — Preparation               | Monster library · monster sheet detail · custom monster · clone monster · validation error · saved encounters · encounter builder · builder empty · large encounter                                |
| Part 4 — Entry and campaign        | Sign in and invite · game system selection · DM home · campaign overview · party · character builder desktop · builder mobile · review · level up · partial loading · error states · connection states |
| Covered as variants, not screens   | Encounter detail (the builder, read-only) · edit monster (custom monster screen) · clone monster (same screen + source banner) · characters list (the party table) · monster sheet from combat (the same context panel) |
| Deliberately not designed          | Lore · NPCs · locations · quests · factions · personal notes · campaign wiki · entity backlinks · maps · tokens · fog of war · dynamic lighting · full VTT                                          |

### Routes and screens

**Entry (unauthenticated, centred card, no shell)**
- Sign in — email/password plus a separate "Join with an invite code" door. A player arriving
  from an invite skips account creation until after the campaign is joined.
- Create campaign — two steps: choose game system, then name and invite. Unavailable systems
  (Pathfinder 2e) are listed with a stated reason. This is the only place unavailable content is
  shown anywhere in Phase 1.

**DM (desktop/tablet, sidebar shell)**
- Home — live-combat band at top (round, turn, connected players, single return action), then two
  columns (prepared for tonight, party changes since last session), then a "recently opened" chip
  row. No analytics, no floating cards.
- Campaign overview — tab strip: Overview, Party, Encounters, Recent combats, Settings. Party
  table, prepared encounters, recent combats, players. Live-combat banner when a fight is running.
- Combat, Encounters, Characters, Monsters, Spells — sidebar destinations.
- Character builder desktop — three columns: wizard steps, step content, live summary aside.

**Player (mobile, bottom-nav shell)**
- Home, my characters, character sheet, combat, dice.
- Builder mobile — one decision per screen, sticky Continue, summary behind a header button.
  Explicitly *not* a compressed desktop layout: three columns become one column plus two overlays.
- Level up — the builder architecture with a rules-engine-generated shorter step list. The review
  splits "you chose" from "applied automatically".

### Shared shell

**DM desktop** — `Sidebar` (232px, 56px collapsed) + top bar (48px) + content + optional docked
`SidePanel` (360px, 440px wide variant).
- Sidebar groups by Session / Library / Campaign, so new Phase 2 entity types land in an existing
  group. `NavItem` carries an icon, a label and an optional count.
- Top bar: page title, search with `⌘K`, primary action. Skinned with a `3px double` brass rule.
- The context panel occupies its own column rather than overlaying content, so a Phase 3 map can
  take the workspace without a relayout.

**Player mobile** — header + scrolling content + `BottomNav` (56px + `env(safe-area-inset-bottom)`).

### Responsive breakpoints and density

Breakpoints are declared in `tokens/layout.css` and mirrored literally in media queries:
`--bp-sm` 480 · `--bp-md` 768 · `--bp-lg` 1024 · `--bp-xl` 1280 · `--bp-2xl` 1600.

- Below 1280px the docked context panel becomes a drawer, and the breadcrumb is dropped entirely
  rather than degraded (the page title beside it carries the same information).
- The initiative row degrades by **container query**, not viewport: wrap rows in `.tc-initlist`
  to arm it. At ≤560px the action cluster hides, at ≤400px the turn label goes visually hidden,
  at ≤300px the HP track hides. Identity always survives — the name column has a 96px floor.
  This is also what makes the row usable in a Phase 3 VTT sidebar.
- Density is a separate axis from viewport: `[data-density]` is `comfortable` (default),
  `compact` (DM combat surfaces) or `touch` (mobile). Every measurement in the control and row
  layer comes from a density token, so one implementation serves a dense DM table and a
  touch-sized mobile sheet.
- `touch-targets.css` is imported last and floors every interactive control at
  `var(--touch-target-min)` = 44px under touch density. Controls designed far below that
  (condition chips, chip dismiss) keep their visual size and gain an invisible expanded hit area.
- Theme is `[data-theme="dark"]` (default, `:root`) or `[data-theme="light"]`.

### Recurring components (77 exported from `_ds_bundle.js`)

- **Actions** — Button, ButtonGroup, IconButton, SplitButton, ToggleButton
- **Forms** — Field, TextInput, Textarea, NumberInput, Select, Checkbox, Radio, Switch, Slider,
  SearchInput, DiceInput
- **Data** — Table, ListRow, KeyValue, DefinitionList, Badge, Tag, Chip, Avatar, AvatarGroup
- **Foundation** — Icon, Panel, SectionHeader, ThemeToggle
- **Navigation** — Sidebar, SidebarGroup, NavItem, BottomNav, Tabs, SegmentedControl, Breadcrumb
- **Feedback** — Alert, Banner, Toast, ToastViewport, Progress, Spinner, Skeleton, EmptyState,
  ConnectionStatus
- **Patterns** — WizardSteps (desktop rail), WizardRail (mobile progress bar)

### Domain-specific components

- **Hit points** — one pattern, three variants, never a fourth: `HPBar` in rows, `HPControl` in
  panels and sheets, a compact bar in tables. Bands run healthy → damaged → critical → down as a
  single jade → brass → crimson read, plus `HPDelta` and a one-pass damage/healing flash.
- **Combat** — InitiativeRow, TurnIndicator, RoundCounter, ConditionChip, DeathSaves, DiceButton,
  RollResult, ActionRow, SpellRow, SpellSlots, Stat, StatGrid, MonsterStatBlock.
- **Privacy** — PrivacyBadge and DMZone. Violet appears nowhere else in the system.

Three extensions are requested by the design and are all derived, not new controls: the combat
control bar, the dice-tray strip, and three more ActionRow slots on MonsterStatBlock. One pattern
is named for the library: the grouped roster row.

### Overlays and panels

`SidePanel` (docked, the desktop default) · `Drawer` · `Modal` · `BottomSheet` · `Popover` ·
`Tooltip` · `Menu` (+ MenuItem, MenuSeparator, MenuLabel) · `CommandMenu` (`⌘K`) · scrim.

Layer order is fixed by `--z-*` tokens and nothing hardcodes a `z-index`. The stated rule is
**context preservation: a side panel is the default, a modal is the exception.**

### Key interactive states

- **Turn** — active (brass left marker + row tint), next, quiet; selected; targeted (dashed
  marker); DM-only (violet hatch); unconscious (crimson, name intact — a live urgent state);
  defeated (grey marker + strikethrough).
- **Loading** — partial, per panel. Skeletons occupy the exact height of the rows they replace so
  nothing shifts; section heads render immediately because they are not data. Shimmer stops under
  `prefers-reduced-motion`.
- **Errors** — the five that matter: failed save (held locally), stale session, failed roll,
  encounter cannot start, invite not sent. Each answers what happened, what is still safe, what to
  do next — and none mention the transport.
- **Connection** — live / reconnecting / offline, each carrying a word and a glyph, never a
  coloured dot alone.
- **Validation** — the alert names the missing choice, the group carrying it is outlined in
  crimson, the footer states how many choices remain. Continue disables; Back and "Save and finish
  later" stay enabled, because an incomplete character is a legitimate draft.
- **Calculated vs chosen** — a persistent distinction, shown by badge, in the builder review, the
  level-up review and the summary aside. Automatic changes are announced with their before/after.

### Accessibility contract carried by the design system

Every state that matters carries a word and a glyph as well as a colour. Text is set from the
`-text` token steps, never from a bare hue. **Nothing readable is dimmed with opacity anywhere in
the system** — de-emphasis uses explicit tokens, weight or a hollow marker. Solid fills never use
step 600 of a ramp (the contrast dead zone), and text on a fill uses the matching
`--color-text-on-*` token. Every mobile control clears 44px. Meters carry real values and spoken
labels.

### Notes for later prompts

- `support.js` is the Claude Design canvas runtime (`dc-runtime`): it parses `<x-dc>` templates,
  resolves `x-import` / `sc-for`, loads React UMD and boots `DCLogic`. It is preview tooling for
  the design document, **not** product source, and nothing in it is ported.
- `_ds_bundle.js` exposes the components on `window.TableCompanionDesignSystem_e2aa9e` as plain
  `React.createElement` calls over the `tc-*` classes, with React as a global. TC-01 should take
  the CSS layer as the source of truth and reimplement the component API as typed modules rather
  than loading the canvas bundle.
- The design system ships `_adherence.oxlintrc.json` for enforcing design-system adherence —
  wire it into `npm run lint` in TC-01.
- Fonts (Instrument Sans, Literata, IBM Plex Mono) and icons (Phosphor) currently load from CDNs
  and are marked in the source as substitutions pending licensed local assets.
- Two open questions the designer flagged for the user: monster instances are auto-named
  `Goblin #1 – #4` rather than prompting the DM, and identical monsters share one grouped
  initiative entry by default, expandable per member.

---

## TC-01 — Design system integrated

The approved CSS is vendored verbatim under `src/design-system/` (mirrored folder layout, so
`styles.css` and its relative imports are unchanged) and is covered by `.prettierignore` to stay
diffable against the design source. React components are thin typed adapters over the `tc-*`
classes and contain no visual decisions. See `DECISIONS.md` for the reasoning.

### Primitives implemented

| Group    | Components                                                        |
| -------- | ----------------------------------------------------------------- |
| Actions  | `Button` (6 variants, 3 sizes, loading, block), `IconButton`        |
| Forms    | `Field` (label/help/error + id wiring), `TextInput`, `Textarea`     |
| Nav      | `Tabs`, `TabPanel`                                                  |
| Data     | `Badge`, `Chip`, `Tag`, `SectionHeader`, `ListRow`, `Table`         |
| Overlays | `Modal`, `Drawer`, `Tooltip`                                        |
| Feedback | `Alert`, `Skeleton`, `Toast`, `ToastViewport`, `ConnectionStatus`   |
| Domain   | `Stat`, `StatGrid`, `HPBar`, `HPDelta`, `HPControl`, `ConditionChip`, `DiceButton`, `RollResult`, `TurnIndicator`, `RoundCounter` |
| Utility  | `Icon`, `cx`, `hpBand`, and the shared token-derived unions         |

### Preserved from the design contract

- **Typography, colour, spacing, shape, motion, icons** — untouched token files; nothing is
  re-declared in TypeScript.
- **Dark/light** via `[data-theme]`; both blocks present in the compiled bundle.
- **Density** via `[data-density]`, independent of viewport, including the `touch-targets.css`
  44px floor and its expanded-hit-area treatment for sub-26px controls.
- **Contrast contract** — adapters set text from `-text` steps and text-on-fills from
  `--color-text-on-*`. No component dims readable text with opacity.
- **Word + glyph, never colour alone** — `ConnectionStatus` and `Badge` always render a label;
  `HPBar`'s meter carries a real spoken value via `aria-label` and `aria-valuenow`.

### Accessibility beyond the CSS

`Modal`/`Drawer` use native `<dialog>` + `showModal()` for focus trap, inert background, Escape
and top-layer stacking. `Tabs` implements roving tabindex with arrow/Home/End and skips disabled
tabs. `Tooltip` shows on focus as well as hover and wires `aria-describedby`. `Field` owns the
`aria-describedby` id wiring. `IconButton` requires a `label`. Icons are `aria-hidden` by default.

### Deliberately not built yet

`SegmentedControl`, `Breadcrumb`, `BottomSheet`, `Popover`, `Menu`, `CommandMenu`,
`InitiativeRow`, `MonsterStatBlock`, `SpellRow`, `DeathSaves`, `WizardSteps`, `Avatar`,
`PrivacyBadge`, `Progress`. Their CSS is all present and vendored; the React adapters land with
the screens that need them, so their APIs are shaped by real usage rather than guessed at.
(`Sidebar`, `SidebarGroup`, `NavItem`, `BottomNav`, `SidePanel`, `Panel` and `EmptyState` landed
in TC-02.)

---

## TC-02 — App shell, navigation and routing

Routing is `react-router-dom` v7. Two shells, because the design specifies two compositions
rather than one responsive layout. See `DECISIONS.md` for the reasoning, including why the
context panel is deliberately not the design system's `Drawer`.

### Shells

| Shell | Composition | Density | Breakpoint behaviour |
| --- | --- | --- | --- |
| `DMShell` (`/dm/*`) | Sidebar + top bar + workspace + context column | `compact` ≥1280, `comfortable` below | Sidebar collapses to the 56px icon rail below 1280px; context panel leaves the flow |
| `PlayerShell` (`/play/*`) | Header + content + bottom nav | `touch` | Mobile-first; arms the 44px control floor |
| Entry (`/`, `/join`, `/campaigns/new`) | Centred card, no shell | `comfortable` | — |

### Navigation

- **DM sidebar** is context-dependent: Session / Library outside a campaign with Home first, and
  Session / Library / Campaign(Party, Sessions) inside one — matching screens 27 and 01.
- **Campaign sub-navigation** is the `Tabs` primitive wired to routes: Overview, Party,
  Encounters, Recent combats, Settings. Phase 2 sections insert between Party and Encounters
  without moving anything.
- **Player bottom nav**: Home, Sheet, Combat (badge on your turn), Dice, Party.
- Both use the design system's `NavItem` / `BottomNav` rendered `as={Link}`, so they are real
  links rather than click handlers.

### Context panel — the reusable pattern

`ContextPanelProvider` + `useContextPanel()` give every DM screen one panel to open:

```tsx
const { show } = useContextPanel();
show({ eyebrow: 'Monster', title: name, body: <StatBlock /> });
```

The screen never knows whether it renders docked or as a drawer. `/dm/monsters` demonstrates it.

### Routes

Entry: `/`, `/join`, `/campaigns/new`. DM: home, combat, encounters, characters, monsters, spells,
items, each with a detail route where the design has one, plus `campaigns/:campaignId` with its
five tabs. Player: home, sheet, combat, dice, party, characters, builder. Plus `/dev/showcase`
and a `*` not-found. Every screen is a route skeleton in `src/screens/index.tsx` — real page
chrome with design-system skeletons standing in for content that arrives TC-04 onward.

### Loading, empty and focus

- `Suspense` boundary inside every page frame, with a skeleton fallback sized to the rows it
  replaces so nothing shifts when data lands.
- `EmptyState` where a route legitimately has nothing (no combat running), saying what will fill
  it. No disabled future features anywhere.
- Skip link as the first tab stop; `<main id="main" tabIndex={-1}>` receives it. Tab order is
  skip link → sidebar → top bar → main → context panel. Escape closes the panel; focus enters it
  on open and returns on close only if it is still inside.

---

## TC-03 — Domain model, ruleset seam and data layer

```
src/domain/
  types.ts                 Core entities. Names no D&D concept.
  permissions.ts           Visibility rules. A UI guard, not a security boundary.
  ruleset/
    Ruleset.ts             The seam: capabilities + derived calculations
    registry.ts            The ONLY module importing a concrete adapter
    dnd5e/constants.ts     Every D&D number and name in the product
    dnd5e/index.ts         The first adapter
  data/
    repositories.ts        Async interfaces
    fixtures.ts            The design's own sample data
    fixtureRepositories.ts In-memory implementations
    RepositoryProvider.tsx useRepositories() + useAsync()
  domain.test.ts           21 tests, including the boundary guard
```

### Entities

`User`, `GameSystem`, `Campaign` + `CampaignMember`, `Character`, `Monster`,
`EncounterTemplate` + `EncounterEntry`, `CombatInstance`, `CombatParticipant`, `Roll` +
`RolledDie`, `Condition`, `DeathSaves`, `HealthTrack`, `Attribute`, `DerivedValue`,
`ResourcePool`, `Visibility`. Ids are nominally branded, so a `MonsterId` cannot be passed where
a `CharacterId` is expected.

### The ruleset seam

`Ruleset` covers exactly what the prompt named: `deriveCharacter` / `deriveMonster` (armour class,
initiative, proficiency), `initiativeRequest`, `spellSlots`, `deathSaveOutcome`, `conditions`,
`characterCreationSteps`, `levelUpSteps`, plus `applyHealthDelta` and `evaluateRoll`.
`RulesetCapabilities` lets a system decline death saves, spellcasting, levelling, temporary hit
points or advantage.

The 5e adapter implements: ability modifiers, the proficiency table, armour class from armour +
capped Dexterity + shield with override support, full/half/pact caster slot progressions, death
saves at three, generated builder and level-up step lists (Fighter loses Spells and gains Fighting
Style; level 3 adds a subclass; 4/8/12/16/19 add an ability score improvement), temp-HP-first
damage, and advantage/disadvantage that keeps the dropped die visible.

### Permissions

`canSee` is the single test the rest is built from. The DM retains full access; `private` means
hidden from the *other* players, not from the owner; `dm-only` and `secret` never reach a player
device. `visibleParticipants` filters an initiative order — the unrevealed Cragmaw Ambusher is
absent from a player's list entirely, not greyed out.

### Proof it holds

`/dm/monsters` reads the library through `useRepositories()`, renders loading, error and empty
branches, and opens each row in the shared context panel. The panel body asks the registry for
the adapter and renders whatever labelled values it returns — that component names no D&D concept
and would render a different system's stat block unchanged.

### Tests — 21, all passing

Boundary guard (no file imports the D&D adapter; the core type surface stays clean), armour class
including caps and overrides, the proficiency table, all three caster progressions, death saves,
generated step lists, temp-HP damage ordering and overkill flooring, advantage keeping the dropped
die, the U+2212 minus sign the design's sample data uses, private sections, dm-only participants,
secret rolls, and the fixture graph resolving.

---

## TC-04 — Entry, DM Home and Player Home

### Screens

| Screen | File | Design source |
| --- | --- | --- |
| Sign in | `screens/entry.tsx` | Screen 25 |
| Join with an invite code | `screens/entry.tsx` | Screen 25 (second door) |
| New campaign — choose a system | `screens/entry.tsx` | Screen 26 |
| DM Home | `screens/DMHome.tsx` | Screen 27 |
| Player Home | `screens/PlayerHome.tsx` | Screen 06 |

### DM Home

Live-combat band (the only loud element on the page): `Live now` badge, round/turn/connected
line, the fight's name at display size, campaign · location · start time, an `AvatarGroup` of
connected players, and one `Return to combat` action. Absent entirely when nothing is running.

Below it, two columns of actual work — `Prepared for tonight` and `Party changes since last
session` — then a single row of recall chips. No analytics anywhere: no session counts, no XP
graphs, no "campaign health". Structure comes from rules and section heads; nothing is a rounded
floating card.

### Player Home

Four things, ranked: the fight that is happening, the character in it, that character's health,
and one advancement offer. The live block carries a `Your turn` badge only when it genuinely is,
and the primary action reads `Take your turn` or `Open combat` accordingly. Armour class comes
from the ruleset, and the level-up offer is gated on `capabilities.levelling` with its decision
count generated from `levelUpSteps()`.

### States, and how to see them

Append `?scenario=` to any route:

| Scenario | What it shows |
| --- | --- |
| *(none)* | The design's world: live fight, four characters, two campaigns |
| `first-time` | No campaigns, no characters — onboarding on both homes |
| `empty` | Campaigns exist, contents stripped — empty sections in the normal frame |
| `loading` | Reads never resolve; the skeleton state stays up |
| `error` | Every read rejects; the recoverable error path renders |

Each home also has per-section empty states (nothing prepared, nothing to catch up on) that show
independently of the account-level ones.

### Domain additions

`RecentItem` and `CampaignActivity` with their repositories and fixtures, plus
`combats.liveForUser()` so "Continue active combat" is one call rather than one per campaign.
`Avatar` / `AvatarGroup` adapters, and `Chip` gained the polymorphic `as` prop.

### Tests — 27, all passing

Six new: the first-time and empty scenarios, the error message staying transport-free,
cross-campaign live-combat lookup, recall ordering and capping, and activity scoping.

---

## TC-05 — Campaigns and party

### Screens

| Screen | Route | Design source |
| --- | --- | --- |
| Campaign list | `/dm/campaigns` | none — rows, matching every other roster |
| Create campaign | `/campaigns/new` | Screen 26, plus step 2 (name + invite) |
| Campaign overview | `/dm/campaigns/:id` | Screen 28 |
| Party | `/dm/campaigns/:id/party` | Screen 29 |
| Encounters | `/dm/campaigns/:id/encounters` | Screen 28's column, full width |
| Recent combats | `/dm/campaigns/:id/combats` | Screen 28's column, full width |
| Settings | `/dm/campaigns/:id/settings` | shell |

### The overview's five questions

What campaign is this (top bar with system and invite code) · who is in the party (table with live
hit points) · is combat running (banner with Return to combat) · what is prepared (encounter list)
· what happened recently (recent combats). Nothing else is on the page.

### Party table

Character, Player, Class, Level, Hit points, AC, Status — and Privacy on the Party tab. Status is
derived, never stored: unconscious, bloodied, level-up ready, or ready, each with a word and a
glyph. AC comes from the ruleset. Wide tables scroll inside their own container so the page never
scrolls sideways.

Clicking a row opens the character in the shared context panel: health, conditions, calculated
values, abilities, and — for the DM only — which sections the party cannot see.

### Required behaviour

- **Game system selection** — step 1 of creation; unavailable systems listed with their reason.
- **One primary DM** — `campaigns.create()` sets the creator as sole DM; Settings states it.
- **Invite code UI** — in the top bar, in a modal with copy-to-clipboard, on the Party tab's
  invite row, and in Settings.
- **Attach or create a character** — the Party tab lists the DM's unattached characters and links
  one, or offers the builder. Attaching is a link; ownership does not change.
- **Active combat and prepared encounters** — banner on the overview, encounter column beside the
  party, live badge on the campaign list.

### Domain additions

`Character.archetype`, `users.byIds()`, `characters.listUnattached()`,
`characters.attachToCampaign()`, `campaigns.create()`, `useAsync().reload()`, two ended combats in
the fixtures, and `as` on `ListRow`.

### Tests — 32, all passing

Five new: campaign creation gives exactly one DM and a well-formed invite code, attaching links
without transferring ownership, attaching a missing character rejects, `byIds` resolves a party in
one call, and past combats sit alongside the live one.

---

## TC-06 — The guided character builder

### How it stays game-system agnostic

`Ruleset` gained a step-form contract. The wizard shell renders four field kinds and
nothing else:

| Kind | Used by D&D for |
| --- | --- |
| `single-choice` | species, background, class, fighting style, ability method, equipment |
| `multi-choice` | skills (bounded by class), cantrips, spells |
| `score-assignment` | the ability array |
| `text` | appearance, backstory |

`BuilderScreen.tsx` and `fields.tsx` name no D&D concept. All content lives in
`ruleset/dnd5e/builder.ts`: 8 species, 6 backgrounds, 8 classes, 4 fighting styles, 4
equipment packs and spell lists for all five caster classes.

### The flow

Ruleset → Species → Background → Class → Ability scores → *(Fighting style | Spells)* →
Proficiencies → Equipment → Details *(optional)* → Review.

The middle is generated: a Fighter gains Fighting style and never sees Spells; a Cleric
gets the reverse. The step count in the header moves with it.

### Behaviour

- **Live summary** — avatar, name, subtitle, headline stats, all six abilities, decisions
  left. Updates on every answer.
- **"Updated by this step"** — the shell diffs derived values across a step and reports
  what moved, e.g. hit points 8 → 12.
- **Validation** — per field. The alert names the missing choice, that group alone is
  outlined, the footer counts what remains, and issues appear only after a Continue
  attempt. Continue disables; Back and "Save and finish later" do not.
- **Dependencies** — changing class clears style, skills, cantrips and spells; choosing a
  background releases a class skill it now grants free; a background skill is shown in the
  class list with its reason but is not selectable.
- **Autosave** — debounced 400ms to localStorage, with the state shown as "Saving…" /
  "Saved just now".
- **Overrides** — hit points and armour class only, decided by `canOverride()`.

### Composition

Desktop (≥1024px): three columns — step rail, question, live summary — with the footer
spanning the middle. Mobile: one decision per screen, the rail reduced to a progress bar,
a sticky Continue, and the summary behind a header button as a Drawer.

### Tests — 45, all passing (13 new in `builder.test.ts`)

Including the acceptance criterion end to end: a Human Soldier Fighter with the standard
array reaches Review with every step valid, STR 15 → 17 and CON 14 → 15 from the 2024
background increases, hit points 12 from d10 + Constitution, armour class 18 from chain
mail with a capped Dexterity plus a shield, initiative +2 and proficiency +2 — none of it
typed in by the user.

---

## TC-07 — Character sheet, privacy and level up

### Routes

| Route | Screen |
| --- | --- |
| `/play/sheet`, `/play/sheet/:id` | Character sheet (mobile and desktop) |
| `/play/sheet/:id/privacy` | Who can see what |
| `/play/sheet/:id/edit` | Character editing |
| `/play/sheet/:id/level-up` | Guided level up |
| `/dm/characters/:id` | The same sheet, viewed by the DM |

### The sheet

Fixed top block, never scrolls: identity, health, the calculated stats (armour class,
initiative, passive perception), all six abilities and any conditions. Everything else is
tabbed — Actions, Spells (casters only), Skills & saves, Items, Features, Background — in
the order a player reaches for them.

Rows are rollable where the ruleset makes them rollable. Expressions arrive with modifiers
applied (`1d20 +6`) and the breakdown stays visible, so the arithmetic is checkable.
Unprepared spells are listed with a hollow marker rather than hidden.

Desktop: fixed 360px identity column plus a scrolling content column, skills two-up, and
the full `HPControl` inline instead of behind a tap.

### Privacy

Three states, exactly as required: owner full access, DM full access, other players see
only what is shared. Each row states the level as a word and a glyph, then repeats it as a
sentence naming who is affected. A hidden section's tab does not exist for another player.
Combat state cannot be hidden and shows fixed text rather than a disabled switch.

### Level up

The builder's field schema and controls, with a step list the rules generate. For a Battle
Master Fighter reaching 7: hit points, one manoeuvre, review. The review splits **You
chose** from **Applied automatically**, with per-change badges (`+9`, `New`, `No change`).

### Domain additions

`Ruleset.sheetSections()`, `sheetContent()`, `levelUpStepForm()`, `validateLevelUpStep()`,
`levelUpChanges()`, `applyLevelUp()`. New types `SheetSection`, `SheetContent`,
`RollableEntry`, `ValueEntry`, `LevelUpChange`, `LevelUpOutcome`. `IconButton` gained `as`.
Fixture characters gained skill proficiencies.

### Tests — 61, all passing (16 new in `sheet.test.ts`)

Section ordering and caster-only tabs; attack expressions with proficiency and a fighting
style applied; skill and save proficiency; unprepared spells staying listed; all three
privacy states against Bram's hidden inventory; a hidden section's tab disappearing for a
player but not the DM; the generated level-up step list; the chosen/automatic split
producing the design's own `+9` and `No change`; and an ability score improvement reaching
the attributes and the derived values.

---

## TC-08a — Monster library

`/dm/monsters` and `/dm/monsters/:id`.

### The table

Name (with a homebrew badge), Type, Size, CR, AC, HP, Source — seven aligned columns at
compact density, sorted by CR descending. Wide tables scroll inside their own container.
Selecting a row opens the docked context panel; there is no separate monster page.

### Filters

| Surface | What |
| --- | --- |
| Filter bar | Search, the first four creature types, applied-filter chips, More filters |
| More filters | Difficulty range, source (library / homebrew), and every declared facet in full |
| Result line | "N of M · sorted by CR, descending", plus Clear filters when any are applied |

Filters come from `Ruleset.monsterFacets()` — type (primary), size, environment — and
`Ruleset.challengeScale()`. The screen names none of them itself.

### States

Loading (skeleton rows), no-search-results (distinct from empty, offering Clear filters),
empty library, error with retry, and a 50-row long list.

### Fixture data

`monsterLibrary.ts` — 50 Monster Manual creatures spanning CR 1/8 to 23 across all 14
creature types, written as a compact table and expanded into domain objects. Plus Marta's
homebrew Cragmaw Ambusher, which sits in the same list.

### Domain additions

`Monster.source`, `Monster.facets`, `MonsterQuery.facets` / `challengeMin` / `challengeMax`
/ `sort`, `Ruleset.monsterFacets()`, `Ruleset.challengeScale()`, `FacetDefinition`.

### Tests — 72, all passing (11 new in `library.test.ts`)

Library length and difficulty spread; all three sorts; subtitle search; facet OR/AND
semantics; inclusive range filtering; filter composition; homebrew sharing the list while
staying isolable; every creature carrying every declared facet; exactly one primary facet;
an ascending challenge scale with fractions; and count ignoring paging.

---

## TC-08b — Monster sheet

`MonsterSheet` is one component with three containers:

| Container | Where |
| --- | --- |
| Docked context panel | The library, on row select |
| Full page | `/dm/monsters/:id` — deep links and narrow viewports |
| Drawer | From an encounter or combat (TC-10 / TC-11 wire the caller) |

### Content order

Primary actions, hit-point control, conditions, last roll, stat block (challenge, speed,
saves, skills, resistances, immunities, senses, languages), ability grid, action groups,
traits. Combat data first, prose last.

### Actions

`Monster.actionGroups` carries actions, reactions, legendary actions and spells as separate
groups with an optional qualifier. Every entry has roll controls;
`Ruleset.monsterActionGroups()` builds `1d20 +11` from a stored `+11` and takes the
rollable half out of `2d10 + 6 piercing` while the row keeps the full string. Recharge and
per-day state are tags on the entry. Abilities roll too.

### The shared roll primitive

`src/app/useRoller.tsx` — `useRoller(systemId)` plus `RollReadout`. The character sheet's
private roller from TC-07 was removed and both sheets now share this one. Dropped dice are
struck through rather than removed, so the arithmetic stays checkable.

### Fixture depth

`monsterDetails.ts` gives six creatures full write-ups: Adult Black Dragon and Ancient Blue
Dragon (legendary actions and reactions), Beholder (ten eye rays), Mind Flayer (innate
spells), Succubus, Troll. Every other creature gets a speed and a sense line so it can
still be run.

### Domain additions

`MonsterAction.rolls` / `.tags` / `.tier`, `MonsterActionGroup`, `Monster.actionGroups`
replacing `Monster.actions`, `Ruleset.monsterActionGroups()`.

### Tests — 83, all passing (11 new in `monsterSheet.test.ts`)

Every creature runnable; high-CR creatures carrying reactions and legendary actions with
their count qualifier; minor creatures not being given legendary actions they lack; attack
and damage expressions; actions with no roll not inventing one; pre-built rolls left alone;
resource tags; spells as a tiered group; the Beholder volume case; homebrew reaching the
sheet with the same shape; and the instance-versus-template boundary.

## TC-08c — Homebrew creature flows

Create from scratch, clone an existing creature, and edit a clone. One component,
`src/screens/monsters/MonsterEditor.tsx`, in three modes.

### Routes

`/dm/monsters/new`, `/dm/monsters/:monsterId/clone`, `/dm/monsters/:monsterId/edit`.
Entry points: **New monster** in the library toolbar and the empty state, **Clone
selected** in the toolbar, and per-creature **Clone** (library content) or **Edit**
(homebrew) in both the context panel and the full monster page.

### Field groups

Always open: identity (name, size, type, alignment, environment), defences (armour class,
hit points with a dice-expression helper, speed), ability scores, actions. Collapsed behind
a `+`: traits, senses, languages, resistances and immunities, legendary actions. Actions are
edited in a modal rather than inline, so the row list stays scannable at ten entries.

### Live preview

The real `MonsterSheet`, fed the draft through `Ruleset.normaliseMonster()` on every edit.
Subtitle, ability modifiers, current health and the armour-class/hit-point/challenge derived
values are rebuilt; DM-stated speed, senses and languages are preserved.

### Persistence

Clone writes on open. All modes autosave on a 500 ms debounce, with a saving/saved
indicator and an inline error if a write is refused. Create inserts once, then updates.

### Domain additions

`Monster.clonedFrom`; `MonsterRepository.create` / `save` / `remove` / `cloneFrom`;
`Ruleset.normaliseMonster` / `validateMonster` / `estimateChallenge` / `hitPointsFromDice`,
implemented in the new `src/domain/ruleset/dnd5e/homebrew.ts`.

### Tests — 94, all passing (11 new in `homebrew.test.ts`)

Dice expressions parsed and nonsense refused; validation naming each wrong field; library
content already valid; the estimate rising with hit points and explaining itself;
normalisation rebuilding derived values while keeping stated ones; a clone that cannot
mutate its source; a saved clone found by search and by the Homebrew filter, then deleted;
library records rejecting `save` and surviving `remove`; and a forged `origin: 'library'`
write coming back as homebrew.

### Checks run

`npm run typecheck`, `npm run lint`, `npm run test` (94 passing), `npm run format:check`,
`npm run build`. Dev server serves all three editor routes and compiles the module.

### Not done

Encounter Builder does not exist yet (TC-09), so "use it in Encounter Builder" is covered
only insofar as homebrew creatures flow through the same `MonsterRepository` every monster
surface reads from. **Add to encounter** remains an inert button until that slice.

## TC-09 — Encounter library and detail

### Routes

`/dm/encounters` (library), `/dm/encounters/:encounterId` (detail), plus
`/dm/encounters/new` and `/dm/encounters/:encounterId/edit` held open for the builder in
TC-10 by `EncounterBuilderPending`. The campaign Encounters tab and the DM home both link
into the detail page.

### Library

A table: Status · Encounter · Participants · Creatures · Difficulty · Adj. XP · Last
edited · actions. Status leads and sorts first, then most recently edited. Row actions are
Start combat / Run again / Resume, Duplicate, and an overflow dialog carrying Open, Edit,
Duplicate and Delete. Delete confirms by name and states that combats already run from the
template are kept.

### Detail

Roster, party and DM-only setup notes down the main column; balance, difficulty bar,
close-to-deadly warning and the primary actions in a 320px aside that wraps under the
roster on narrow viewports. A live encounter carries a banner with the round and a link
into the fight. A template referencing a deleted creature says how many are missing rather
than silently shrinking.

### Difficulty

`Ruleset.encounterDifficulty(creatures, party)` → `{ label, tone, fill, metric, detail,
breakdown, warning? }` or `null`. The 5e adapter (`src/domain/ruleset/dnd5e/encounters.ts`)
implements the published method: XP by challenge rank, a multiplier by creature count, and
thresholds summed from each character's level. With no party it reports `Unrated` and still
states the XP.

### Domain additions

`EncounterTemplate.location` / `.notes` / `.updatedAt`; `difficultyLabel` removed.
`EncounterRepository.create` / `save` / `remove` / `duplicate`.
`CombatRepository.startFromTemplate`. `EncounterCreature` and `EncounterDifficulty` on the
ruleset seam.

### States

Loading, error, no campaign, no encounters, and a twelve-row populated list are all
reachable. `?scenario=empty` gives the empty case, `?scenario=loading` and
`?scenario=error` the other two.

### Tests — 106, all passing (12 new in `encounters.test.ts`)

Difficulty rising as the party shrinks; crowd multipliers beating raw XP; an unrated
encounter withholding judgement but not the number; the breakdown's shape; a deadly fight
not warned about being close to deadly; duplication producing an unrun, independent copy;
create/save/remove round trips; starting not writing to the template; the same template
run twice giving two independent fights; counts expanding into grouped, numbered,
full-health combatants with the party added; and hidden entries staying private.

### Checks run

`npm run typecheck`, `npm run lint`, `npm run test` (106 passing), `npm run format:check`,
`npm run build`. Dev server serves all four encounter routes and compiles every new module.

### Not done

The combat runner is TC-11. `/dm/combat/:combatId` now resolves the instance and reports
its combatant count and round instead of claiming no combat is running, but it does not
run the fight.

## TC-10 — The encounter builder

`src/screens/encounters/EncounterBuilder.tsx`, one component in two modes, on
`/dm/encounters/new` and `/dm/encounters/:encounterId/edit`. The route skeleton TC-09 held
open is gone.

### Library rail

`SegmentedControl` over three sources.
- **Monsters** — search with a `/` shortcut, rows showing CR, XP, AC and HP, an info button
  that fills the shared context panel with the real `MonsterSheet`, and a plus button that
  adds. The panel's own `Add to <encounter>` leaves the panel open for the next candidate.
- **Party** — the campaign's characters, with a plus for anyone currently sitting out.
- **Saved** — the campaign's other encounters, with a button that folds their roster in.

### Composition

Encounter name; location as a text field with a datalist of the campaign's known places;
the monster roster with a quantity stepper, a hide toggle, a stat-block button and a
remove button per group; the party with hit points and a Present switch each; and setup
notes inside the hatched DM zone with a `DM only` privacy badge. The Monsters header
states `N creatures · N groups · N combatants with the party`.

### Summary

The shared `BalancePanel` — breakdown rows, difficulty bar and the close-to-deadly warning,
all printed as the ruleset stated them — then the instance alert, Start combat / Run again /
Resume, and Duplicate template.

### Behaviour

Autosave on a 500 ms debounce with a `Saving… / Saved` indicator. Create inserts an
"Untitled encounter" and replaces its URL with the edit route. Difficulty recomputes on
every change against the party actually present.

### Domain additions

`EncounterTemplate.absentCharacterIds`, honoured by `startFromTemplate` and by the
difficulty rating on the library, the detail page and the builder.

### Design system additions

`NumberInput`, `Switch`, `SegmentedControl`; `icon` on `SectionHeader`; a forwarded `ref` on
`TextInput`. All three components wrap CSS already vendored from the approved source.

### Tests — 116, all passing (10 new in `screens/encounters/composition.test.ts`)

Add being idempotent into a count; the per-group cap holding against both repeated adds and
a merge; typed quantities clamped and rounded; hiding not disturbing a count; removal
taking exactly one group; every transform leaving its input untouched; absence recorded and
cleared; a merged roster copying rows rather than sharing them; and search being
case- and whitespace-forgiving but bounded.

### Checks run

`npm run typecheck`, `npm run lint`, `npm run test` (116 passing), `npm run format:check`,
`npm run build`. Dev server serves `/dm/encounters/new` and `/dm/encounters/:id/edit` and
compiles every new module.

### Not done

No drag-and-drop: roster order carries no meaning, so it would be a second way to do
nothing. No "Group identical" expand toggle — per-participant names and initiative live on
a combat instance, which is TC-11.

## TC-10b — Encounter summary, validation and save feedback

### Summary

`summarise()` returns creatures, groups, party present, total combatants and how many
entries reference a creature that no longer exists. It feeds the Monsters section header,
the new **This encounter** block in the aside, the large-encounter bar and the detail page,
so all four agree by construction.

### Difficulty

Unchanged seam: `Ruleset.encounterDifficulty` supplies label, tone, bar position, breakdown
and warning, and every surface prints it verbatim. The builder's top bar now carries the
difficulty badge, and `BalancePanel` still degrades to "This game system does not rate
encounter difficulty" when a ruleset declines.

### Validation

`validateEncounter()` in `screens/encounters/composition.ts`. Blocking: unnamed, no
creatures — Start is disabled and the reason sits beside it. Warnings, above the roster:
creatures missing from the library, nobody from the party present, more than twenty
combatants, and every creature starting hidden. The detail page runs the same checks.

### Autosave

`pending` ref plus `flush()`. Flushed on the debounce, on unmount, on `beforeunload`, and
before Start, Duplicate and Done. A failed write stays pending and is retried by the alert's
Try again or by the next edit. Indicator: `Draft · autosaved` / `Saving…` / `Saved` /
`Not saved`, `aria-live="polite"`, red only on failure.

### Template immutability

`EncounterRepository.byId`, `listForCampaign`, `create`, `save` and `duplicate` all return
detached copies via `copyTemplate`; `startFromTemplate` writes only `lastRunAt` and does so
through the same copy. Nothing a caller holds can reach the stored template.

### Large-encounter state

Past four groups a sticky bar appears under the roster with `N creatures · N groups · N
combatants`, the ruleset's own summary line, and Start combat.

### Tests — 125, all passing (9 new)

Six in `composition.test.ts`: the summary's counts; missing creatures counted rather than
dropped; empty and unnamed both blocking; a normal fight raising nothing; a crowded fight
warned but not blocked; nobody-present and nothing-visible both stated, and a single hidden
group correctly left alone. Three in `encounters.test.ts`: a mutated read not reaching the
store, two reads not sharing a roster, and a saved draft the caller keeps editing.

### Checks run

`npm run typecheck`, `npm run lint`, `npm run test` (125 passing), `npm run format:check`,
`npm run build`. Dev server serves the builder for an empty, a small and a sixteen-creature
encounter.

## TC-10c — Start combat from an encounter

### Flow

`Start combat` on the library row, the detail page or the builder calls
`combats.startFromTemplate`, which creates a `preparing` instance and navigates to
`/dm/combat/:combatId`. That route branches on status: `preparing` renders `CombatSetup`,
`live`/`ended` render the turn-order summary the TC-11 runner will replace.

### Pre-start adjustments

Per row: initiative (typed or rolled), hide/reveal from the party, remove from this fight.
Grouped rows expand to give one member its own name or initiative. `Roll what is missing`
fills only empty rows; `Re-roll all` overwrites. One roll per row, because identical
creatures take one group turn.

### Round 1

`Begin round 1` sorts through `Ruleset.initiativeOrder`, sets status `live`, round 1, marks
the first combatant active and stamps `startedAt`. No confirmation dialog anywhere in the
flow. Blocked only by an empty fight; unrolled initiative and a party-less fight warn.

### Domain additions

`Ruleset.initiativeOrder(participants)`; `CombatRepository.save(combat)`. Combat reads now
return detached copies via `copyCombat`, matching the encounter repository.

### Files

`src/screens/combat/setup.ts` (pure transforms), `CombatSetup.tsx`, `CombatScreen.tsx`,
`setup.test.ts`. The `DMCombat` route skeleton in `screens/index.tsx` was deleted.

### Tests — 137, all passing (12 new in `screens/combat/setup.test.ts`)

Grouping identical creatures into one row and one turn; a row reporting a shared initiative
only when its members agree; a row setting all its members; rename and hide touching only
their target; removal clearing the active turn when it pointed at the removed combatant;
one roll per row; `Roll what is missing` not overwriting a typed number and `Re-roll all`
doing so; the ability modifier reaching the roll; empty blocking while unrolled and
party-less only warn; round 1 sorting, marking active and stamping; the tie-break and
unrolled placement; and a full start-to-round-1 session leaving the template byte-identical
apart from `lastRunAt`.

### Checks run

`npm run typecheck`, `npm run lint`, `npm run test` (137 passing), `npm run format:check`,
`npm run build`. Dev server serves `/dm/combat`, a live fight, an ended fight and the
encounter that starts one.

### Not done

The combat runner — turn advance, damage, conditions, the roll log, the initiative row
component — is TC-11.

## TC-11a — DM live combat

`src/screens/combat/CombatRunner.tsx`, reached when a `CombatInstance` is `live`.

### Command bar

`.tc-combatbar` in `shell.css` — the design's proposed Extension 1. Round counter,
`TurnIndicator` naming the participant, `Next · <name>` in mono, then Previous, Next turn
and End combat.

### Initiative list

New `InitiativeRow` design-system adapter over the vendored `.tc-init` CSS: marker,
initiative, entity dot, name, state flag, identity line with armour class, condition chips
(four, then a count), death-save pips, HP bar and a row action cluster — move earlier, move
later, set initiative, give the turn. The list is wrapped in `.tc-initlist`, which arms the
design's container queries for tablet widths.

### Turn logic

`src/screens/combat/turns.ts`: `nextTurn`, `previousTurn`, `jumpToTurn`, `moveParticipant`,
`resortByInitiative`, `setInitiativeDuringCombat`, `orderDiffersFromInitiative`,
`nextParticipant`, `endCombat`. All pure transforms of a `CombatInstance`; none can name an
`EncounterTemplate`.

### Context panel

The shared `useContextPanel`. A creature opens the real `MonsterSheet` with its live hit
points and conditions; a character opens a compact identity block plus a link to the full
sheet. Docked at ≥1280, drawer below.

### Fixture

The live fight is now 13 combatants — 4 players, 8 creatures, 1 NPC — carrying every state
the row draws.

### Tests — 153, all passing (16 new in `screens/combat/turns.test.ts`)

Turn advance and the round only moving on a wrap; previous walking back a round and
refusing to go below round 1; defeated stepped over; an unconscious player keeping their
turn; no survivors leaving the fight put; a lone survivor still starting a new round;
jumping the turn; manual moves not touching initiative and refusing to run off either end;
a changed number not reordering until asked, and the re-sort offer appearing and clearing;
ending clearing and stamping; the fixture's load and states; and a full round of the real
fixture returning to where it started.

### Checks run

`npm run typecheck`, `npm run lint`, `npm run test` (153 passing), `npm run format:check`,
`npm run build`. Dev server serves the live fight, an ended fight and the no-combat state.

### Not done

Damage, healing, condition editing, the roll log and the dice tray are TC-11b.

## TC-11b — Combat actions, dice and hit points

### Action execution

The context panel (`src/screens/combat/CombatPanel.tsx`) shows hit points, death saves,
conditions and then the stat block. Creature actions come from `MonsterSheet` with its new
`onRoll` prop; character actions from `Ruleset.sheetContent(character, 'actions')`. Every
roll button logs. A damage roll applies to the targeted combatant immediately.

### Dice and the log

`useCombatLog` records actor, title, expression, dice, modifier, total, outcome, visibility
and time for every roll, and writes plain notes for damage, healing, undo and condition
changes. The log renders under the initiative list with a dice tray strip: four expressions,
an amount stepper, Damage and Heal against the target, and the undo.

### Public and secret

A `Roll secretly` switch on the log header. Secret rolls are stored `dm-only` and rendered
inside the hatched DM zone. The split uses `isPlayerVisibleRoll`, the same predicate
`canSeeRoll` gives a player device.

### Hit points, conditions, death saves

`src/screens/combat/actions.ts`: `applyHealth`, `revertHealth`, `setTargeted`,
`addCondition`, `removeCondition`, `applyDeathSave`. Row controls apply the tray amount as
damage or healing; `HPControl` in the panel does the same with its own entry. Conditions are
chips from `Ruleset.conditions`, toggled in place.

### Ruleset additions

`deathSaveRequest`, `applyDeathSave`, `concentrationCheck`, `concentrationKey`, plus the
`DeathSaveResult` shape. `RollRepository.record`; `CombatParticipant.targeted`;
`isPlayerVisibleRoll` and `visibleRolls` in `permissions.ts`.

### Tests — 171, all passing (18 new)

`screens/combat/actions.test.ts` — damage landing with no approval step; temporary hit
points absorbing first; a character going unconscious with a tally while a creature is
defeated; healing clearing it; undo restoring exactly; single targeting; conditions added
once and removed by key; concentration asked for only on damage to someone holding it, with
the ruleset's own difficulty; death saves for a success, a failure, a natural 1, a natural
20, three failures and three successes; and the prompt's flow end to end — attack, damage,
target, apply, hit points move.

`domain/rolls.test.ts` — a secret roll reaching the DM and no player; ordinary rolls
reaching everyone; the shared predicate and the viewer test agreeing for every visibility;
a player log filtered clean; a recorded secret roll surviving the round trip and staying out
of a player log; and the log handing out copies.

### Checks run

`npm run typecheck`, `npm run lint`, `npm run test` (171 passing), `npm run format:check`,
`npm run build`. Dev server serves the live fight and compiles every new module.

### Not done

Player-facing combat is TC-12. The dice tray's expressions are fixed rather than derived
from the active combatant.

## TC-11c — Combat log history, correction and recovery

### Log history

The log region is collapsible — open at ≥1280, collapsed below — bounded to 38vh (46vh on
short screens) and scrolling inside itself. `Show recent` / `Show all` switches between the
last ten and the whole history; the count sits in the header. Secret entries stay in their
own hatched DM zone.

### Targeted undo

Each health change is stored against the log line that recorded it, and that line offers
`Undo 12 damage to Goblin #3`. Undo restores the exact prior track, state and death saves,
appends a correction line, and removes itself. The dice tray repeats only the newest offer.

### DM overrides

`overrideHealth` sets an exact number without the ruleset's delta handling and without
forcing a concentration save; `overrideState` sets a state by hand. Both live under an
`Override` heading in the context panel and both are reversible.

### Connection

`src/app/useConnection.ts` — `live` / `reconnecting` / `offline` from the browser's
online/offline events plus the last write outcome, with a `restored` flag that clears itself
after four seconds. The DM shell's footer now shows it instead of a hardcoded "Live". A
failed write shows a warning that the change is held on this device with a `Try again` that
re-sends the pending state; recovery says "Back in sync" once.

### Realtime

One 900ms hit-point flash on the row that changed, via `InitiativeRow`'s new `delta` prop.
Nothing loops.

### Combat ended

`src/screens/combat/CombatEnded.tsx` — rounds, combatants, standing, defeated, duration and
roll count; every participant with their final hit points and state; the full log with
DM-only lines marked; a link back to the untouched template; and `Reopen this combat`, which
resumes at the round it stopped on with every hit point and condition intact.

### Tablet pass

Row controls take a 40px minimum below 1280px, the control bar and dice tray gain row gaps
for legible wrapping, and the log starts collapsed so the initiative list keeps its height.
Turn advance lives in the control bar, which wraps but never hides; HP editing, conditions
and details are all in the context panel, which is the drawer at that width — so the
design's container query removing the row cluster on a narrow column takes nothing away.

### Tests — 178, all passing (7 new in `screens/combat/actions.test.ts`)

An override stating a number rather than applying a delta and leaving temporary hit points
alone; clamping to the track; an override to zero downing a character and back up clearing
the tally; an override being reversible like any other change; state set by hand not
touching hit points and clearing a tally it no longer needs; reopening keeping the round and
every hit point; and reopening a live fight changing nothing.

### Checks run

`npm run typecheck`, `npm run lint`, `npm run test` (178 passing), `npm run format:check`,
`npm run build`. Dev server serves the live fight and the ended fight.

## TC-12 — Player mobile combat

`src/screens/player/PlayerCombat.tsx` on `/play/combat`, replacing the TC-02 route skeleton.

### States

- **Waiting** — header with connection status, a strip carrying the round counter, who is
  acting and `You are next`, the initiative order, and recent rolls.
- **Your turn** — the brass command band replaces the header, stating the round, the
  character and the turn position, with End Turn in the band. Below it: roll mode
  (normal / advantage / disadvantage), four action buttons at 52px in a two-up grid, and
  the current target.
- **Low HP** — a warning when the character is at or under a quarter of their track.
- **Unconscious** — the danger band replaces the header, death-save pips, one
  `Death saving throw` button, what a natural 20 does, and who in the party can help.
- **Reconnecting** — a banner saying the last roll was saved and the fight is still
  running, plus the connection status in the header.
- **Ended** — how the character came out of it and the rolls they can still read back.

### Action flow

Tapping an action rolls it and, for an attack, rolls its damage in the same pass. Both land
in one bottom `Sheet` with the outcome and a single primary action naming the amount and the
target. No approval step; hit points change on every device.

### Shared components and boundaries

`InitiativeRow`, `HPBar`, `ConditionChip`, `RollResult`, `DiceButton`, `RoundCounter`,
`SegmentedControl` and the combat log/action transforms are all the ones the DM screen uses.
`playerOrder` filters through `visibleParticipants`; rolls through `visibleRolls`.

### Design-system additions

`Banner`, `DeathSaves` and `Sheet`, each a typed adapter over CSS already vendored from the
approved source.

### Tests — 186, all passing (8 new in `screens/player/turn.test.ts`)

An unrevealed creature absent from the player order while the DM sees the whole thing;
nothing left hinting at a removed row; a player finding their own combatant and a character
who is not in the fight finding none; low health being a quarter of the track and zero being
down rather than low; quick actions being the character's own rollables without their damage
rolls; an attack knowing the damage that follows it; four actions on the thumb; and a
breakdown leaving a dropped die out of the sum.

### Checks run

`npm run typecheck`, `npm run lint`, `npm run test` (186 passing), `npm run format:check`,
`npm run build`. Dev server serves `/play/combat` and compiles both new modules.

### Not done

The bottom-nav badge on the player's turn — the nav is in the shell and does not know about
the fight; threading combat state through for one badge waits for TC-13's realtime channel.

## TC-13 — Data access, realtime and persistence seams

### What was inspected first

No backend, no API client, no server directory — greenfield. React 19 + Vite 7, one runtime
dependency beyond React. So the boundary was written rather than integrated with, and the
fixtures were kept as a first-class local data source.

### The seams

- `src/domain/data/apiContract.ts` — every route and verb in one file, plus `ApiConfig` and
  a retryable `ApiError`. Reads return domain shapes verbatim; writes are `PUT` with the
  whole record so replays are no-ops.
- `src/domain/data/httpRepositories.ts` — the `Repositories` surface over `fetch`, one
  method per contract route. Injectable `fetch`, so it is tested without a network.
- `src/domain/data/realtime.ts` — `DomainEvent`, `ConnectionState`, `RealtimeChannel`, and
  three implementations: `createLocalChannel` (BroadcastChannel), `createSocketChannel`
  (WebSocket with backoff and a send queue), `createNullChannel`.
- `src/domain/data/withRealtime.ts` — decorates any `Repositories` so every mutation
  publishes its event.
- `src/domain/data/dataSource.ts` — picks fixtures or API, and local or socket channel, from
  `VITE_API_BASE_URL` / `VITE_REALTIME_URL`.
- `src/domain/data/SessionProvider.tsx` — `useSession`, `useUserId`, `SessionGate`.

### Contracts covered

Campaign, Character, Monster, Encounter, Combat, Roll and Draft state all route through
`Repositories`. Autosave, optimistic-update and retry policy are stated in
`repositories.ts`. Reconnect and refresh: `useChannelStatus` feeds `useConnection`;
`useRealtime` re-reads on `combat.changed`, `combat.ended` and `roll.recorded` in both the
DM runner and the player screen.

### Fixture decoupling

`CURRENT_USER_ID` is no longer exported from the domain barrel. Ten screens moved to
`useUserId()`. No file under `src/screens/` or `src/app/` imports fixture data.

### Configuration

`.env.example` documents both variables and states in its own header that no `VITE_`
variable may hold a credential. No real env file exists in the repository; a production
build with nothing configured inlines an empty env object, verified against `dist`.

### Tests — 197, all passing (11 new in `src/domain/seams.test.ts`)

No screen or shell file importing fixture data; the barrel not re-exporting the fixture
user; a saved fight announcing itself and an ended one saying so specifically; a start
announcing both fight and template; an encounter edit announcing and a read not; a recorded
roll announcing without carrying a result; a device not hearing its own echo; every
repository call reaching the contract's path; a monster query becoming the documented query
string; a failure reporting whether a retry is worth it; and the contract naming a route for
every method the client uses.

### Checks run

`npm run typecheck`, `npm run lint`, `npm run test` (197 passing), `npm run format:check`,
`npm run build`. Dev server serves the entry, DM and player routes plus `?scenario=empty`,
and compiles every new module.

### Not done

No backend is included — this is the boundary, not an implementation of the other side. No
provider was chosen and no credential is read anywhere.

## TC-14 — Responsive, accessibility and input pass

### Defects found and fixed

1. **Hover-only row actions** — `.tc-table__rowactions` at `opacity: 0` until hover made
   Start combat, Duplicate and the overflow menu unreachable on touch, in both the encounter
   and monster libraries. Revealed under `@media (hover: none)` in `adapters.css`.
   `.tc-action__rolls` had the same shape and got the same escape.
2. **The bottom sheet had no user-agent reset** — `Sheet` shipped in TC-12 without the
   `dialog.tc-*` neutralisation `Modal` and `Drawer` have, so it rendered with the browser's
   padding, border, background and `max-height`, and no scrim.
3. **Long names broke the initiative row** — the name button had no `min-width: 0`, so
   `text-overflow` never applied and the row overflowed instead of ellipsing.
4. **No headings anywhere** — one `<h3>` in the application. Page titles are `<h1>`,
   `SectionHeader` renders `h2`/`h3` with an overridable `level`, `EmptyState` renders `h2`;
   user-agent heading styling is zeroed in `shell.css`.
5. **The monster editor squeezed its form on a tablet** — the 400px preview is now
   `flex: 1 1 340px` and wraps, matching the encounter builder and detail.

### Verified rather than assumed

Global focus ring covers every focusable element type. `touch-targets.css` enforces the 44px
floor at touch density, with expanded hit areas for controls too small to grow. Both shells
have a `main` landmark and a skip link; both navs are named `nav` elements. Reduced motion
zeroes the duration tokens and stops all three looping animations. Every coloured state also
renders a word. Overlays are native `<dialog>`s, so focus trap, Escape and focus return come
from the platform; the context panel, which is deliberately not a dialog, restores focus by
hand.

### Tests — 209, all passing (12 new in `src/design-system/accessibility.test.ts`)

Icon-only controls having names; `IconButton.label` being required, not optional; nothing
revealed by hover alone — derived by enumerating every `opacity: 0` rule in the vendored CSS
and requiring a touch escape for each one a `:hover` selector reveals; the escape querying
the device rather than the viewport; page, section and empty-state titles being headings; the
heading tags carrying no user-agent styling; both shells exposing a main landmark and a skip
link; all three overlays going through the one native-dialog helper; every rendered dialog
class having a reset and a backdrop, derived from `Overlay.tsx`; the context panel restoring
focus; reduced motion stopping every looping animation; and the row-state and connection maps
each pairing a colour with a word.

The hover check was mutation-verified: removing the fix fails it.

### Checks run

`npm run typecheck`, `npm run lint`, `npm run test` (209 passing), `npm run format:check`,
`npm run build`. Dev server serves DM combat, both libraries, the monster editor, a
20+-action creature, an empty state and player combat.

### Not done

Contrast ratios, rendered focus order and real thumb comfort are measurements this repository
cannot take — there is no browser automation installed. The tokens follow the approved
palette and the floors are enforced in CSS, but none of that is a measurement, and this pass
does not claim otherwise.

## TC-15 — Design fidelity audit

### Method

Token files and Part 4 read back through `claude_design` MCP and compared against the
vendored copies declaration by declaration — type ramp, semantic `-text` steps, tracking,
breakpoints, frame proportions, all three density blocks. Every compared value is identical
to the approved source. The audit standard applied is the design's own closing paragraph:
"No screen introduces a container style, colour or type size that does not appear
elsewhere."

### Findings

| Area | Result |
|---|---|
| Typography tokens | Identical to source |
| Layout, frame, breakpoints | Identical to source |
| Density (comfortable / compact / touch) | Identical to source |
| Colour in screens | No literal anywhere — all tokens |
| Colour in application CSS | No literal anywhere |
| Off-ramp type sizes | 7, every one traced to the approved canvas and kept |
| On-ramp size written as a literal | 1, fixed |
| Magic numbers duplicating tokens | 3, replaced |
| Nav proportions | Token-driven in `nav.css` and `shell.css` |
| Motion ceiling | 900ms flash is the longest, as the design requires |
| Meters | Carry real values and spoken labels |
| Readable text dimmed by opacity | None in the application layer |

### Fixed

- `Privacy.tsx` used `fontSize: 12` where `--font-size-12` exists.
- `.tc-combatbar` 40px → `--layout-toolbar-height`.
- Tablet row-control bump 40px → `--density-control-height-lg`.
- Player dice grid 52px → `--density-control-height`.
- `FLASH_MS` now names the `--duration-flash` token it mirrors.

### Kept deliberately

Seven off-ramp type sizes (26, 28, 22, 20, 19, 14.5, 12.5) that the approved canvas draws
directly. Normalising them onto the token ramp would reduce fidelity, not improve it.

### Tests — 217, all passing (8 new in `src/design-system/fidelity.test.ts`)

No screen naming a colour; the application stylesheets naming none either; no restatement of
a number the tokens hold; every off-ramp type size being one the design draws, against a
closed list; the type ramp unchanged from source; all three densities unchanged from source;
frame proportions coming from tokens; and nothing animating longer than the permitted flash,
with the runner's mirrored constant checked against it.

### Checks run

`npm run typecheck`, `npm run lint`, `npm run test` (217 passing), `npm run format:check`,
`npm run build`. Dev server serves DM home, DM combat, encounters, player combat and the
builder.

### Not done

Nothing was rendered and measured — there is no browser automation in this repository, so
the audit compares source against source. Contrast ratios and true pixel comparison remain
outside what this project can check.

## TC-16 — Testing, performance and edge cases

### Required coverage, mapped

| Area | Where |
|---|---|
| Ruleset adapter calculations | `domain.test.ts`, `sheet.test.ts`, `builder.test.ts`, `homebrew.test.ts`, `encounters.test.ts` |
| Ruleset contract completeness | `rulesetContract.test.ts` — new |
| Character Builder critical path | `builder.test.ts` |
| Privacy visibility | `sheet.test.ts`, `rolls.test.ts` |
| Encounter template vs Combat Instance | `encounters.test.ts`, `screens/combat/setup.test.ts` |
| Initiative and turn advancement | `screens/combat/turns.test.ts` |
| HP damage / heal / undo | `screens/combat/actions.test.ts` |
| Public vs secret rolls | `domain/rolls.test.ts` |
| Connection and reconnect | `app/connection.test.ts` — new |
| Responsive smoke | `app/connection.test.ts` — new |

### Added

- `src/domain/rulesetContract.test.ts` — the three previously untested seam methods, plus a
  guard that every seam method is exercised and every ready adapter implements all of it.
  Both guards mutation-verified.
- `src/app/connection.test.ts` — channel subscribe/unsubscribe/status against the real
  implementations, the rules `useConnection` is built from, the failure copy, and the
  responsive contract (breakpoints, density switch, panel forms, container-query opt-in).

### Performance

- **Bundle**: one 620 kB chunk → 418 kB entry plus per-route chunks; the Vite size warning
  is gone and the player's combat screen is 11 kB on its own. Required wrapping each shell's
  `Outlet` in `Suspense` — the existing boundary sits inside `DMPage`, below the route.
- **Combat re-renders**: `armourOf` no longer calls `deriveCharacter` per row per render;
  `useCombatLog` no longer re-filters the whole log and hands out fresh array identities on
  every render.
- **List keys**: audited. Every `key={index}` is over a fixed positional array (pips, dice,
  skeleton rows) where the index is the identity. Nothing dynamic uses one.
- **Hydration**: not applicable — client-rendered Vite, no SSR.

### Tests — 237, all passing (20 new)

### Checks run

`npm run typecheck`, `npm run lint`, `npm run test` (237 passing), `npm run format:check`,
`npm run build`. Dev server serves entry, DM home, DM combat, the encounter builder, the
monster editor, player combat, the character builder and `?scenario=error`, with no errors
or warnings in the dev log.

### Not covered by any automated check

Rendered focus order; contrast ratios; real thumb comfort; the 1280px panel reflow as it
happens; the flash and reduced motion as a browser honours them; and genuine cross-tab
delivery over the local channel. Listed in DECISIONS.md as the manual pass this leaves.

---

## TC-17 — Phase 1 audit and handoff

Final audit of the Phase 1 implementation, plus the developer handoff. One behavioural
change came out of the audit; the rest is verification and documentation.

### What the audit found

Six routes rendered a `SectionHeader` plus a permanent `Skeleton` with no data behind them:
`/dm/characters`, `/dm/spells`, `/dm/items`, `/play/dice`, `/play/party`,
`/play/characters`. A skeleton that never resolves reads as an app stuck loading, so each
was resolved rather than left.

### Four screens built

| Route | Reads | Notes |
| --- | --- | --- |
| `/dm/characters` | `campaigns.listForUser` → `characters.listForCampaign` → `users.byIds` | Grouped by campaign, reusing the campaign Party tab's `PartyTable` |
| `/play/characters` | `characters.listForOwner` | Campaign name, pending level-up badge, link to the sheet |
| `/play/party` | owner's campaign roster + `users.byIds` | Health and conditions only — the sections the design marks always-shared |
| `/play/dice` | `characters.listForOwner` for the system id | `useRoller` over a die grid; advantage only where `capabilities.advantage` and only on d20 |

`PartyTable` in `CampaignScreens.tsx` was exported rather than duplicated, so one table
definition serves the campaign tab and the DM's cross-campaign list.

### Two screens removed

`/dm/spells` and `/dm/items`, with their sidebar entries. `Requirements.md` §18.1 does not
place them in the Phase 1 information architecture and no spell or item content exists.
Route entries, lazy imports and nav entries all deleted; `nav.ts` documents why in place.

### One screen made reachable

`/play/characters` had no inbound link. The player Home's "Your character" header now shows
an "All N" action when the player owns more than one character. The bottom bar stays at
five — a sixth breaks the touch target on a small phone.

### Files changed

- `src/screens/index.tsx` — four real screens replacing six skeletons; a shared
  `ScreenState` for the loading and failure branches.
- `src/app/routes.tsx` — two route entries and two lazy imports removed.
- `src/app/nav.ts` — two sidebar entries removed, with the rationale in the file header.
- `src/screens/PlayerHome.tsx` — "All N" action to My characters.
- `src/screens/campaign/CampaignScreens.tsx` — `PartyTable` exported.
- `src/app/routes.test.ts` — new.
- `README.md`, `PROJECT_STATUS.md`, `REQUIREMENTS_TRACEABILITY.md`, `DECISIONS.md`.

### Tests — 241, all passing (4 new)

`src/app/routes.test.ts`: every DM sidebar destination resolves to a declared route; every
player bottom-bar destination resolves; the bottom bar holds at most five entries; no routed
screen renders a `PendingSection` and the two removed routes stay removed.

The first was mutation-verified — pointing a nav entry at the removed `/dm/spells` fails the
test, as it must.

### Documentation

- `REQUIREMENTS_TRACEABILITY.md` — was a three-line stub, now traces all 37 items of
  `Requirements.md` §6 plus the §18 information architecture and the cross-cutting
  requirements to routes, components and tests, with a Status column that says Partial or
  Blocked where that is the truth. Every file path in it was checked to exist; three were
  wrong on the first pass and corrected.
- `PROJECT_STATUS.md` — was stale by twelve prompts (active item `TC-06`, last completed
  `TC-03`). Now correct, with a Phase 1 scope-gaps table.
- `README.md` — stack table corrected (router, test runner, "no state library"), route table
  extended, the data and realtime seams documented with their environment switches, project
  layout brought up to date, and a Handoff section: where to start reading, the three rules
  enforced by tests, known limitations, next recommended work.
- `DECISIONS.md` — TC-17 reasoning appended.

### Phase 1 scope gaps

Three §6 items are not fully built, and every document now says so rather than implying
otherwise: authentication has identity but no credentials; realtime has the seam, the local
channel and the socket client but no server (TC-13 forbade choosing a credentialed
provider); the 5e.tools ingest does not exist and the monster library reads hand-authored
SRD stat blocks in the ingest shape.

### Checks run

`npm run typecheck`, `npm run lint` (0 findings), `npm run test` (241 passing),
`npm run format:check` (clean), `npm run build` (417 kB entry / 130 kB gzip, no size
warning). Dev server started on a spare port; every route module transforms without error
and the four new routes serve.

`git log --name-only` across the whole Phase 1 history confirms no protected source —
`Requirements.md`, `IMPLEMENTATION_DECISIONS.md`, `DESIGN_SOURCE.md`, `CLAUDE.md`,
`.claude/`, `tools/`, `prompts/` — was ever modified, and no verbatim design-system CSS was
touched in this slice.

### Not covered by any automated check

Unchanged from TC-16: rendered focus order; contrast ratios; real thumb comfort; the 1280px
panel reflow; the flash and reduced motion as a browser honours them; genuine cross-tab
delivery. Listed at the end of `DECISIONS.md` as the manual pass Phase 1 leaves.
