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

---

# Production sequence (TC-P00 onward)

`prompts-extra/` is an independent hardening sequence that starts after Phase 1. It does not
modify the `prompts/` runner sequence, and Phase 1 remains complete on its own terms.

## TC-P00 — Production baseline and gap audit

Audit only. No product code changed in this step, by instruction.

### Baseline, actually run

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | Clean, no output |
| Lint | `npm run lint` | Clean, 0 findings |
| Tests | `npm run test` | **241 pass, 0 fail, 0 skipped**, 580ms |
| Format | `npm run format:check` | Clean, all matched files |
| Build | `npm run build` | Success in 1.33s — 417.34 kB entry / 130.41 kB gzip, 92.33 kB CSS, per-route chunks, no size warning |

Every check passes. That is the honest baseline: **the suite is green and the product is not
production-ready**, because nothing in the suite tests a server, a database, an authenticated
request or a second client. The green is real and its scope is small.

### The distinction this audit turns on

A Phase 1 requirement can be **UI/domain complete** — the screens, states, rules and pure
transforms are built and tested — while having **no production backing**: no durable store, no
credential check, no server that decides anything. Phase 1 built the first honestly and never
claimed the second. `Requirements.md` §6 has 37 items;
[REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) marks 34 Done, 2 Partial, 1 Blocked
against the Phase 1 definition. Against a production definition the count is different.

### Capability map — UI/domain vs production-backed

Persistence column: **Fixture** means in-memory or `localStorage` only. Auth column: **None**
means no credential is checked anywhere. Realtime column: **Local** means `BroadcastChannel`,
one machine.

| Capability (§6) | UI / domain | Persistence | Auth | Realtime |
| --- | --- | --- | --- | --- |
| 1 Authentication / users | Screens + `SessionProvider` | Fixture user | **None** | — |
| 2 Game system selection | Complete | Static registry | — | — |
| 3–4 Campaigns, party | Complete | Fixture | **None** | Local |
| 5–7 Builder, character mgmt, level up | Complete | Fixture + **`localStorage` drafts** | **None** | Local |
| 8–9 Sheets, privacy controls | Complete | Fixture | **None** | Local |
| 10–14 Monsters, homebrew, clone, edit | Complete | Fixture | **None** | Local |
| 15–17 Encounters, reuse | Complete | Fixture | **None** | Local |
| 18–27 Live combat, initiative, turns, HP, conditions, death saves | Complete | Fixture | **None** | Local |
| 28–33 Dice, rolls, public/secret, log | Complete | Fixture | **None** | Local |
| 34 DM override / undo | Complete | Fixture | **None** | Local |
| 35 5e.tools data | Hand-authored SRD fixtures | Fixture | — | — |
| 36 Autosave | Complete | Fixture | — | — |
| 37 Reconnect / recovery | Complete | Fixture | — | Local |

**Production-backed count: zero.** Not one capability is behind a real store, a real credential
or a real server. [dataSource.ts](src/domain/data/dataSource.ts) is honest about it —
`description: 'Local fixtures — no server configured'`.

### Evidence-based gap map

Each row is a defect with a location, not an impression.

#### A. Persistence

| # | Gap | Evidence |
| --- | --- | --- |
| A1 | No backend service exists in the repository — no `server/`, no `Dockerfile`, no `.github/` | Repository root listing |
| A2 | Unset `VITE_API_BASE_URL` selects fixtures, so the current `dist/` **is** the fixture build | [dataSource.ts:73-81](src/domain/data/dataSource.ts#L73-L81) |
| A3 | Character drafts persist to `localStorage` — one browser, one device, cleared by the user | [fixtureRepositories.ts:127-152](src/domain/data/fixtureRepositories.ts#L127-L152) |
| A4 | No database boundary at all: no schema, no migrations, no ownership constraints, no transactions | Repository root; `startFromTemplate` expands a roster as an array loop at [fixtureRepositories.ts:495-529](src/domain/data/fixtureRepositories.ts#L495-L529) |
| A5 | Ids are minted client-side. The roll id is a module-scoped counter reset per page load, so two devices in one fight collide on their first roll each | [useCombatLog.tsx:88](src/screens/combat/useCombatLog.tsx#L88) (`r-live-${sequence}`), [fixtureRepositories.ts:91](src/domain/data/fixtureRepositories.ts#L91) |

#### B. Authentication and authorization

| # | Gap | Evidence |
| --- | --- | --- |
| B1 | Sign-in checks the email's shape and then navigates. No credential is verified | [entry.tsx:108-118](src/screens/entry.tsx#L108-L118) |
| B2 | The invite code is length-checked, never resolved against a campaign, then navigates | [entry.tsx:183-191](src/screens/entry.tsx#L183-L191) |
| B3 | `SessionProvider` establishes *who*, never *that*. It reads `users.current()` and says so in its own header | [SessionProvider.tsx:1-12](src/domain/data/SessionProvider.tsx#L1-L12) |
| B4 | No route guard. `/dm/*` renders for anyone who types it | [routes.tsx](src/app/routes.tsx) — no auth wrapper on any branch |
| B5 | The DM/player role is decided by which URL you opened, with a hardcoded `role: 'player'` on the player route | [PlayerCombat.tsx:109-113](src/screens/player/PlayerCombat.tsx#L109-L113) |
| B6 | `ApiConfig.authorization` is declared but never populated — `createDataSource` passes only `baseUrl`. `credentials: 'same-origin'` also means a cross-origin API receives no cookie | [apiContract.ts:119-129](src/domain/data/apiContract.ts#L119-L129), [dataSource.ts:66](src/domain/data/dataSource.ts#L66), [httpRepositories.ts:74](src/domain/data/httpRepositories.ts#L74) |

#### C. Permissions enforced only on the client

| # | Gap | Evidence |
| --- | --- | --- |
| C1 | `permissions.ts` is a UI guard and states it in its header. Every rule needs a server twin | [permissions.ts:1-9](src/domain/permissions.ts#L1-L9) |
| C2 | `GET /combats/:id` returns the whole `CombatInstance` — `dm-only` participants and unrevealed creatures included — and the player's device filters them out afterwards. Devtools reveals the ambush | [apiContract.ts:90](src/domain/data/apiContract.ts#L90) + `visibleParticipants` in [permissions.ts](src/domain/permissions.ts) |
| C3 | `GET /combats/:id/rolls` returns every roll including secret DM rolls; `visibleRolls` filters client-side | [apiContract.ts:98-101](src/domain/data/apiContract.ts#L98-L101) |
| C4 | Character section privacy is the same shape — the full `Character` goes over the wire and the sheet hides tabs | [apiContract.ts:51](src/domain/data/apiContract.ts#L51) |

#### D. Unsafe whole-record writes

| # | Gap | Evidence |
| --- | --- | --- |
| D1 | A **player's device** writes the entire `CombatInstance`. That is everyone's hit points, the turn pointer, initiative and the hidden roster, sent as one `PUT` from the least trusted client in the fight | [PlayerCombat.tsx:127-139](src/screens/player/PlayerCombat.tsx#L127-L139) → [apiContract.ts:95](src/domain/data/apiContract.ts#L95) |
| D2 | Two writers, no concurrency control. The DM runner and the player both `PUT /combats/:id` with no version, ETag or `If-Match`. Last write wins silently — a player's end-turn can erase the DM's damage | [CombatScreen.tsx:93](src/screens/combat/CombatScreen.tsx#L93), [PlayerCombat.tsx:129](src/screens/player/PlayerCombat.tsx#L129) |
| D3 | The same full-record `PUT` shape covers encounters, monsters and character attachment | [apiContract.ts:62,73,54](src/domain/data/apiContract.ts#L54) |
| D4 | Dice are evaluated on the client and the finished result is POSTed. A server would be transcribing, not refereeing | [useCombatLog.tsx:82-94](src/screens/combat/useCombatLog.tsx#L82-L94), [useRoller.tsx:53](src/app/useRoller.tsx#L53) |

Note: idempotent whole-record `PUT` was a correct Phase 1 decision for **single-writer**
documents under autosave, and the reasoning in
[repositories.ts:11-31](src/domain/data/repositories.ts#L11-L31) still holds for encounters,
monsters and drafts. It is only wrong where two clients write one record, which is combat.

#### E. Missing runtime validation

| # | Gap | Evidence |
| --- | --- | --- |
| E1 | Every HTTP response is cast, never parsed: `return (await response.json()) as T`. A cast is a compile-time claim, so a malformed or hostile payload enters the domain fully typed | [httpRepositories.ts:85](src/domain/data/httpRepositories.ts#L85) |
| E2 | No schema module exists anywhere in `src/` — validation is types only, and types are erased | `tsc --noEmit` is the only enforcement; no runtime guard |
| E3 | Request bodies are unvalidated because there is nothing to validate them | No server |
| E4 | Realtime frames are cast the same way on arrival | [realtime.ts](src/domain/data/realtime.ts) socket channel |

#### F. Realtime authority

| # | Gap | Evidence |
| --- | --- | --- |
| F1 | No realtime server. The default channel is `BroadcastChannel` — same machine only, which is genuinely useful for development and is not multiplayer | [dataSource.ts:57-59](src/domain/data/dataSource.ts#L57-L59) |
| F2 | Events carry a client-chosen `origin` string, so echo suppression is client-trusted | [realtime.ts:86-89](src/domain/data/realtime.ts#L86-L89) |
| F3 | No topic scoping — every subscriber would receive every campaign's events unless a server scopes them | [realtime.ts:65-73](src/domain/data/realtime.ts#L65-L73) |

The event-as-notification design itself is **correct and should be preserved**: a receiver is
told what changed and re-reads, so a stale event can never write stale data. That property
survives a real server unchanged.

#### G. Deployment and observability

| # | Gap | Evidence |
| --- | --- | --- |
| G1 | No CI. No `.github/`, no pipeline, no required checks on a branch | Repository root |
| G2 | No container or compose file, no local Postgres setup | Repository root |
| G3 | No health check, no readiness probe, no migration runner | No server |
| G4 | No structured logging, no error reporting, no metrics, no tracing | No server; the client reports failures only into its own UI, see [useConnection.ts](src/app/useConnection.ts) |
| G5 | `.env.example` documents two public `VITE_*` variables and correctly forbids credentials in them. No server-side configuration surface exists yet | [.env.example](.env.example) |

#### H. Content and licensing

| # | Gap | Evidence |
| --- | --- | --- |
| H1 | No ingest pipeline. The library is hand-authored SRD stat blocks in the ingest shape | [monsterLibrary.ts](src/domain/data/monsterLibrary.ts), [monsterDetails.ts](src/domain/data/monsterDetails.ts) |
| H2 | No licence/attribution boundary is recorded for ingested content, and no separation of library storage from user campaign data exists in a store, only in the interface split | [repositories.ts:8-9](src/domain/data/repositories.ts#L8-L9) |

### What is production-grade already and must be preserved

The audit found no defect in any of these, and TC-P01 onward should build behind them rather
than through them.

| Asset | Why it survives |
| --- | --- |
| The design system | Verbatim from the approved source, guarded by [fidelity.test.ts](src/design-system/fidelity.test.ts) and [accessibility.test.ts](src/design-system/accessibility.test.ts) |
| The ruleset seam | `Ruleset` + `registry.ts`; the boundary is enforced by a test that walks every source file — [domain.test.ts](src/domain/domain.test.ts), [rulesetContract.test.ts](src/domain/rulesetContract.test.ts) |
| Repository interfaces | Async from the first line, which is exactly what lets a real store replace fixtures without a screen changing shape — [repositories.ts](src/domain/data/repositories.ts) |
| `apiContract.ts` | One file naming every route and verb. A backend can be written against it; it does not need reverse-engineering |
| Realtime event model | Notifications, not payloads. Correct under concurrency |
| Pure transforms | `turns.ts`, `actions.ts`, `setup.ts`, `composition.ts` are pure functions over domain objects, so the server can run the same code rather than a second implementation |
| Route graph, shells, a11y pass | Guarded by [routes.test.ts](src/app/routes.test.ts) and the TC-14 work |

The frontend and the system-agnostic ruleset architecture are preserved. The defects above are
all at or below the data seam.

### Target architecture

Recorded in full, with reasoning, as decisions 19–27 in
[IMPLEMENTATION_DECISIONS.md](IMPLEMENTATION_DECISIONS.md). Summary:

- **Backend boundary** — a Node + TypeScript service in this repository, sharing
  `src/domain/types.ts` as the wire format, implementing `apiContract.ts`. The client keeps its
  repository interfaces unchanged.
- **Database ownership** — PostgreSQL, written **only** by the server. No client ever holds a
  connection string. Ruleset-specific data stays in JSONB so no D&D column reaches a generic
  table. Ingested library content is a separate ownership boundary from user campaign data.
- **Authentication boundary** — the server issues an httpOnly, SameSite session cookie. No
  token may live in a `VITE_*` variable, because Vite inlines those into the bundle. Every
  request is authenticated at the server edge; the client never decides.
- **Authorization** — every rule in `permissions.ts` gains a server twin, and responses are
  **filtered per viewer** rather than filtered after delivery. `dm-only` and `secret` data must
  not leave the server for a player socket or a player request.
- **Realtime authority** — a server-owned WebSocket, scoped per campaign, fanning out
  server-stamped events. Events stay notifications. `origin` becomes server-assigned.
- **Combat authority** — the server owns turn order, hit points, dice and ids. Client transforms
  become optimistic display over a server-confirmed state.
- **Validation** — one shared schema module validating request bodies at the server edge and
  response bodies at the client edge.

### Production Golden Path

The single scenario that defines "production-ready". It is **Not Started**, and no part of it
may be marked Done from a fixture run.

1. A DM signs up with a real credential and the session survives a page reload.
2. The DM creates a campaign; it is present in PostgreSQL after a server restart.
3. The DM invites a player; a **second, independent client** — different browser profile, not a
   second tab — redeems the code and is authenticated as a different user.
4. The player builds a character through the guided builder; the draft survives being resumed on
   a different device.
5. The DM builds an encounter from library and homebrew creatures and saves it.
6. The DM starts combat from that encounter. A hidden creature is in the roster.
7. The player's device **never receives** the hidden creature or any secret DM roll — verified in
   the network payload, not in the rendered UI.
8. The DM rolls; the player rolls; both devices show the same fight state within the realtime
   budget. Dice results come from the server.
9. The player's client attempts a write it is not entitled to make and the server **rejects** it.
10. The player disconnects, reconnects, and recovers the exact fight state.
11. The DM applies damage, overrides a value and undoes it. Every step survives a server restart.
12. Combat ends; the encounter template is byte-identical apart from `lastRunAt`.

### Production checklist

Explicit states. **Not Started** is the honest default and appears often on purpose.

| # | Item | Prompt | State |
| --- | --- | --- | --- |
| 1 | Evidence-based production gap map | TC-P00 | **Done** |
| 2 | Target backend / database / auth / realtime boundaries recorded | TC-P00 | **Done** |
| 3 | Baseline lint / typecheck / test / build recorded from a real run | TC-P00 | **Done** |
| 4 | Ordered plan for TC-P01 onward | TC-P00 | **Done** |
| 5 | Backend service scaffold implementing `apiContract.ts` | TC-P01 | **Done** |
| 6 | PostgreSQL schema + migrations + local dev setup | TC-P01 | **Done** |
| 7 | Server-owned persistence for all §6 entities | TC-P01 | **Done** |
| 8 | Fixtures demoted to an explicit development mode | TC-P01 | **Done** |
| 9 | Database integration tests incl. restart persistence | TC-P01 | **Done** |
| 10 | Real credential check and session issuance | TC-P02 | **Done** |
| 11 | Invite redemption bound to a real campaign and user | TC-P02 | **Done** |
| 12 | Route guards and a server-derived role (not URL-derived) | TC-P02 | **Done** |
| 13 | Server-side authorization twin for every `permissions.ts` rule | TC-P02 | **Done** |
| 14 | Per-viewer response filtering (`dm-only`, `secret`, private sections) | TC-P02 | **Done** |
| 15 | Runtime request validation at the server edge | TC-P03 | **Done** |
| 16 | Runtime response validation replacing the `as T` cast | TC-P03 | **Done** |
| 17 | Safe error contract — no stack traces, no internals to clients | TC-P03 | **Done** |
| 18 | Rate limiting, body limits, CORS and security headers | TC-P03 | **Done** |
| 19 | Server-authoritative combat mutations (intent, not whole-record) | TC-P04 | **Done** |
| 20 | Concurrency control — versioning / `If-Match`, no silent last-write-wins | TC-P04 | **Done** |
| 21 | Server-side dice and server-minted ids | TC-P04 | In Progress — state-moving dice (initiative, death saves) and every id are the server's. A free-form attack roll is still client-evaluated and lands through `health.damage`. TC-P10 audited it as **non-blocking (F-2)**: bounded to creatures, so it is a cheating vector between people who chose to play together, not an escalation or a leak |
| 22 | Realtime server with per-campaign scoping | TC-P05 | **Done** — server-sent events rather than a WebSocket; see TC-P05 |
| 23 | Server-stamped event origin; per-viewer event filtering | TC-P05 | **Done** |
| 24 | Reconnect and state recovery verified against a real server | TC-P05 | **Done** |
| 25 | Content ingest pipeline, isolated from user data | TC-P06 | **Done** |
| 26 | Licence and attribution boundary recorded | TC-P06 | **Done** — enforced by the importer, not only recorded |
| 27 | Account lifecycle, operational and offline states | TC-P07 | **Done** |
| 28 | End-to-end multiplayer test with two independent clients | TC-P08 | **Done** |
| 29 | Negative security tests — unauthorized write is rejected | TC-P08 | **Done** — TC-P02 at the store, TC-P08 over HTTP and with two browsers |
| 30 | Hidden data absent from the player's payload, asserted on the wire | TC-P08 | **Done** — asserted in the payload, the DOM and the logs, from a second browser |
| 31 | CI pipeline running the full suite | TC-P09 | **Done** |
| 32 | Container / deployment definition and migration runner | TC-P09 | **Done** |
| 33 | Health checks, structured logging, error reporting, metrics | TC-P09 | **Done** — liveness *and* readiness, `/metrics`, an enforced redaction guard, and a process-level error boundary |
| 34 | Golden Path passing with real persistence and two clients | TC-P10 | **Done** — TC-P08 against the local stack, TC-P09 against a clean staging container |

### Ordered plan for TC-P01 onward

The `prompts-extra/` sequence order is correct and the dependencies are real, not stylistic.

| Order | Prompt | Depends on | Unblocks |
| --- | --- | --- | --- |
| 1 | **TC-P01** backend + PostgreSQL | — | Everything. Nothing else can be enforced without a server that owns state |
| 2 | **TC-P02** authentication + server authorization | P01 | Closes B1–B6 and C1–C4. Must land before any real data is exposed |
| 3 | **TC-P03** validation + hardening | P01, P02 | Closes E1–E4. Comes after auth so the trust boundary being validated is known |
| 4 | **TC-P04** server-authoritative combat + concurrency | P01–P03 | Closes D1–D4 and A5 |
| 5 | **TC-P05** realtime sync + recovery | P04 | Closes F1–F3. After P04, because a fan-out of a state nobody owns is worse than none |
| 6 | **TC-P06** content pipeline + legal boundary | P01 | Closes H1–H2. Independent of P02–P05; can run in parallel if resourced |
| 7 | **TC-P07** account, offline and operational states | P02 | Product completeness on top of a real account |
| 8 | **TC-P08** e2e multiplayer, security, resilience | P02–P05 | Proves the Golden Path's security clauses on the wire |
| 9 | **TC-P09** CI/CD, observability, infrastructure | P01–P08 | Closes G1–G5 |
| 10 | **TC-P10** final readiness + Golden Path | all | The only step permitted to state "production-ready" |

**Next eligible prompt: TC-P01** — backend and PostgreSQL foundation.

### Risks carried into TC-P01

- **Contract drift.** `apiContract.ts` has never been exercised against a server. Expect
  mismatches on first connection; the README already predicts this. They are contract bugs, not
  architecture bugs, and the contract file is the place to fix them.
- **The cookie/CORS decision has a client consequence.** `credentials: 'same-origin'`
  ([httpRepositories.ts:74](src/domain/data/httpRepositories.ts#L74)) only works if the API is
  same-site. Deciding otherwise means changing that line and configuring CORS, and it must be a
  deliberate decision rather than a discovered one.
- **Combat write model is a breaking change.** Moving combat off whole-record `PUT` changes the
  contract and both combat screens. It is the largest client-visible change in the sequence and
  belongs in TC-P04, not smeared across earlier prompts.
- **No DOM or browser automation exists.** The Golden Path's clauses 3, 7, 8 and 9 need two real
  clients. That is a genuine new dependency decision for TC-P08, in the same category as the
  test-stack note in `DECISIONS.md` (TC-16).

### Checks run

`npm run typecheck`, `npm run lint`, `npm run test` (241 passing), `npm run format:check`,
`npm run build` — all from a real run, output recorded in the baseline table above. No product
source was changed in TC-P00, so no visual fidelity check applies; the design system was not
touched.

## TC-P01 — Backend and PostgreSQL foundation

The other half of `apiContract.ts` now exists. No screen, shell, design-system file, domain type
or ruleset adapter was changed: the seam TC-13 wrote was the right shape, and this slice built
behind it rather than through it.

### What was inspected first

TC-P00's gap map, then the seam itself — `repositories.ts`, `apiContract.ts`,
`httpRepositories.ts`, `fixtureRepositories.ts` and `types.ts` in full. Two findings shaped
everything below. `Repositories` has been async since TC-03, so a database can satisfy it with no
calling code changing. And the contract's own first rule — "reads return domain shapes verbatim,
there is no DTO layer" — makes `src/domain/types.ts` the wire format, which is why the server
shares it rather than restating it.

### The service

`server/`, Node + TypeScript, in this repository, sharing the domain model.

| File | What it is |
| --- | --- |
| [main.ts](server/main.ts) | Configure, migrate, listen, shut the listener before the pool |
| [config.ts](server/config.ts) | Environment validated at startup, so a misconfigured deploy fails on boot |
| [db.ts](server/db.ts) | The pool. `query`, `tx`, and the only `import pg` in the repository |
| [migrate.ts](server/migrate.ts) | Filename-ordered SQL, one transaction each, recorded by name |
| [migrations/001_initial.sql](server/migrations/001_initial.sql) | The schema |
| [store.ts](server/store.ts) | `Repositories` over SQL — the twin of `fixtureRepositories.ts` |
| [routes.ts](server/routes.ts) | One entry per contract route. No business logic |
| [http.ts](server/http.ts) | Matcher, JSON, error mapping, body limit |
| [seed.ts](server/seed.ts) | The fixtures, demoted to development data |

**No web framework and no ORM.** The surface is 40 enumerated routes with no middleware stack, so
a framework would be a dependency for a matcher and a JSON writer; migrations are SQL files, so a
migration tool would be a dependency for forty lines. That is the reasoning that left this
repository without a state library, a CSS framework or a test framework, applied to the server.
`pg` is the one new runtime dependency, because Node has no PostgreSQL client and the wire
protocol is not a few lines.

### The schema

Fourteen tables plus `schema_migrations`: `users`, `campaigns`, `campaign_members`, `invites`,
`characters`, `character_drafts`, `monsters`, `encounters`, `combats`, `combat_participants`,
`combat_events`, `rolls`, and `recents` / `campaign_activity` behind the two feed reads.

A column exists when the server needs to constrain, own, join or filter on it. Everything
ruleset-shaped — `attributes`, `systemData`, `actionGroups`, `derived`, `facets`, builder
`choices`, the roster of an encounter — is JSONB. The database names no D&D concept, for the same
reason `types.ts` does not.

Three rules the database enforces rather than trusts:

| Rule | Mechanism |
| --- | --- |
| Ingested content and user data do not mix | A check constraint on `monsters` refuses a library row with an owner, and the store's `create` / `save` always write homebrew |
| A participant's source is real and single | A check pairing `source_kind` with exactly one of `source_character_id` / `source_monster_id`, each a foreign key |
| A fight cannot edit its template | Structural: no statement in the store writes an encounter's roster from a combat write. `startFromTemplate` sets `last_run_at` and nothing else |

`combat_participants` is a table rather than a JSON array on the combat, because TC-P04 has to
authorize and update one participant at a time. TC-P01 still replaces the set as a unit, which is
what the current whole-record contract means — so TC-P04 becomes a change to one function rather
than a migration under a live product. `combats.version` is maintained on every write and not yet
checked, for the same reason.

`combat_events` is the append-only history, written in the same transaction as the fight, so a
fight and its history cannot disagree. TC-P04 and TC-P05 read it; TC-P01 establishes it.

### Fixtures, demoted

`createFixtureRepositories` is unchanged and is still what an unconfigured `npm run dev` uses.
What changed is its status: it is a development mode, and `npm run db:seed` loads the same world
into PostgreSQL as development data. The seed is insert-only — `on conflict do nothing` on every
statement, no delete, no truncate, no reset — so running it against a database someone is working
in cannot lose their work.

Library monsters are inserted there and only there, with `origin = 'library'` and no owner. The
store cannot write a library row at all. Ingest is its own boundary; TC-P06 owns the pipeline.

### Wiring the frontend

`VITE_API_BASE_URL=/api`, and nothing else. Vite's dev server proxies `/api` to the backend, so
the browser makes a **same-origin** request: no CORS to configure and none written. That is also
the shape TC-P02 needs, because `httpRepositories.ts` sends `credentials: 'same-origin'` and a
SameSite session cookie only travels on a same-site request. TC-P00 listed that as a decision to
take deliberately rather than discover; this is it, taken.

### One defect found and fixed

Restarting PostgreSQL under a running server killed the process. `pg` reports a dropped idle
client as an `error` event on the pool, and an unhandled `error` event is an uncaught exception. A
database blip must not be an API outage. [db.ts](server/db.ts) now handles it: the broken client
is discarded and logged, the next request opens a new one. Verified by restarting the container
under a live server — it logged `terminating connection due to administrator command` and kept
answering — and covered by a test that terminates the pool's own backend.

### Contract drift: none

TC-P00 predicted mismatches on first connection. There were none that changed the contract. Two
shapes needed care rather than change:

- `characters.listForOwner` and `characters.listUnattached` are the same path in the contract,
  separated only by `?attached=false`. The server has one route that branches on the query, and a
  test asserts it does not grow a second.
- `monsters.list` and `monsters.count` interpolate a whole query string into their path, not an
  id. The contract test generates both shapes and accepts either.

`apiContract.ts` was not edited.

### Tests — 268, all passing (27 new)

`server/routing.test.ts` — 9, no database:

Every contract route served with the same verb, generated from `API_ROUTES` itself; every server
route being one the contract names, so a dead route fails too; a literal path beating a
placeholder whatever order the table is in, checked against a reversed table; the verb being part
of the match; path parameters decoded and a longer path not partially matching; the two contract
entries that share a path resolving to one route; a monster query round-tripping from the string
the client builds; nonsense in a query string dropped rather than guessed at; and zero and
fractional difficulty bounds surviving, which `CR 1/8` needs.

`server/store.test.ts` — 18, needs a database, skips cleanly without one:

Migrations recorded and idempotent; every domain entity having a table; the seeded world readable
through a second connection pool; a dropped connection being survivable; campaign creation
writing one DM, an invite row and a well-formed code; attaching a character linking without
moving ownership and upserting membership once; a missing character refused; a library creature
refusing edits and surviving removal; the database itself refusing to give a library creature an
owner; a forged `origin: 'library'` write coming back homebrew; a clone independent of its source
in both directions; facet OR, facet AND, range, search, sort, limit, and count ignoring the
limit; a duplicate that is unrun and independent; `startFromTemplate` expanding a count into
numbered grouped combatants at full health, honouring `hidden` and `absentCharacterIds`, and
leaving the template byte-identical apart from `lastRunAt`; a save rewriting the roster,
preserving order, appending exactly one event and never touching the template; a schema-violating
write leaving the fight and its history untouched; rolls append-only with a colliding client id
re-minted; and a draft upserting on autosave then becoming a character exactly once.

With `DATABASE_URL` unset the 18 integration tests skip and the suite is 250 passing, so the
repository stays green on a machine with no database.

### Checks run

`npm run typecheck`, `npm run lint` (0 findings), `npm run format:check` (clean),
`npm run build` (417.34 kB entry / 130.41 kB gzip — unchanged, the server is not in the browser
bundle), and `npm run test` twice: **268 passing** with `DATABASE_URL` set, and **250 passing,
18 skipped** without it.

Beyond the suite, the acceptance criterion was exercised against a real database:

- `docker compose up -d`, then `npm run db:migrate` and `npm run db:seed` on an empty volume.
- The server started, and 15 endpoints were called over HTTP: health, `/me`, game systems,
  campaigns, monster list and count, a missing record answering `200 null`, an unknown path
  answering 404, a library monster write refused with 409 and the design's own sentence, campaign
  creation, encounter create and save, `start`, a combat `PUT`, a roll, and a delete answering
  204 with no body.
- `docker compose down` **destroyed the container**, `up -d` recreated it, the server restarted,
  and the campaign, the live combat with six participants at round 1, and the recorded roll all
  read back unchanged. The named volume is never removed by anything in this repository.
- `docker compose restart postgres` under a live server: the server logged the dropped connection
  and continued serving.

### One flaky test, found and fixed

Running the suite repeatedly surfaced an intermittent failure in
`a payload over the size limit is refused by name` — TC-P03's 2 MB upload check. It is not a
server defect: refusing before reading the body is exactly what that test asserts, and the
consequence is that the socket closes while the caller is still writing. `fetch` surfaces that
as a rejected promise and **loses the response the server already sent**, which is why it only
failed under load.

Rewritten over a raw `node:http` request, which lets the write fail and still reads the answer.
The assertion is unchanged and no weaker. Nine consecutive full-suite runs green since.
- **The screens are still checked by reading them, not rendering them.** No DOM test
  environment; each of these test files says so in its own header.

### Not done, and deliberately so

- **No authorization.** Every handler trusts its caller, and `GET /me` answers from
  `TC_DEV_USER_ID` — a development shim the server refuses to accept when `NODE_ENV=production`.
  TC-P02.
- **No runtime body validation.** Query strings are coerced; JSON bodies are cast. TC-P03.
- **Combat is not server-authoritative.** Whole-record `PUT`, unchecked version, client-minted
  ids, client-rolled dice. TC-P04.
- **No realtime server, no ingest pipeline, no CI, no container for the application, and no
  observability beyond `/health` and stderr.** TC-P05, TC-P06 and TC-P09.

Half-fixing any of those here would have spread one prompt's subject across four.

### Next eligible prompt

**TC-P02** — authentication and server authorization.

## TC-P02 — Authentication and server authorization

TC-P00's gap categories B (authentication), C (client-only permissions) and most of D (unsafe
whole-record writes) are closed. The server is now the authority; the client's permission
helpers are what keep the UI honest about it.

### Sessions, without a token anywhere in the browser

`server/auth.ts`, `node:crypto` and nothing else.

| Concern | How |
| --- | --- |
| Passwords | scrypt (N=16384, r=8, p=1), per-password salt, parameters stored in the digest so they can be raised later without invalidating anything. Compared with `timingSafeEqual`. |
| Sessions | 32 random bytes, returned once. The database stores only the SHA-256, so a read of `sessions` cannot impersonate anybody. |
| Transport | `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` in production. Script cannot read it and the browser never attaches it cross-site. |
| Expiry | 30 days, sliding, checked in SQL rather than in JavaScript so a skewed process clock cannot revive a dead session. Touched at most once a day, not once a request. |
| Enumeration | A wrong password and an unknown address return the same sentence, and an unknown address burns a real scrypt verification first so the two take the same time. |

`GET /me` is both "who am I" and "am I still signed in", so there is no refresh call for a
client to forget to make. `POST /auth/sign-out` revokes the row and clears the cookie, and it
succeeds on an already-dead session rather than answering 401 and leaving a stale cookie behind.

### Authorization: one wrapper, no route can forget

`server/authorize.ts` decorates the store with the caller's identity, and `http.ts` hands
handlers nothing else. The route table did not change.

- **Roles are read, never claimed.** `roleIn(campaignId)` resolves the DM and the members from
  `campaign_members`. A `dmUserId` in a request body is overwritten with the session's account,
  not honoured — creating a campaign while claiming to be somebody else makes you the DM of
  your own campaign.
- **Default closed.** `Route.anonymous` marks the three routes that exist to get a session; a
  route is protected by having said nothing. A signed-out caller's `Repositories` is a proxy
  that refuses every method, so a new repository is refused by having said nothing too.
- **Refusal shape follows the contract.** Where a read is typed `T | null`, a record you may
  not have reads as `null` — indistinguishable from one that does not exist, so probing ids
  tells an attacker nothing. Everywhere else, 403.

Scoping, in one table:

| Surface | Rule |
| --- | --- |
| Campaigns | Members only. `listForUser` is your own account or 403 |
| Characters | Owner, or the DM, or a party member — and a party member gets a redacted copy |
| Encounters | DM only, end to end: the template carries DM-only setup notes, so a player receives no encounter rather than a stripped one |
| Combat | Members read; participants filtered per viewer. Only the DM starts one |
| Rolls | Members read; secret rolls filtered out. A player cannot record one |
| Monsters | Library is shared; homebrew is the owner's alone, invisible and unwritable to anyone else. `create` and `cloneFrom` assign ownership rather than accepting it |
| Drafts, recents, activity | Your own account only |
| Users | You see who you share a campaign with. The directory is not public |

### Private data is absent, not hidden

The server imports `src/domain/permissions.ts` — the same module the screens use — and runs it
**before serialising**. One statement of the rules, read twice: the UI reads it to decide what
to draw, the server reads it to decide what to send. A second predicate somewhere is exactly
how a secret roll eventually leaks, so there isn't one.

- An unrevealed creature has no row in a player's payload. Not dimmed, not `null` — absent.
- A secret roll is not in a player's log, and a player who claims `visibility: 'dm-only'` on
  their own roll has it recorded as `party`. Rolling in secret is a DM privilege the design
  grants explicitly; a device does not get to grant itself one.
- A hidden character section takes its ruleset data with it. The redaction is coarse and says
  so: `systemData` is a bag only the ruleset can read, so hiding one section drops the whole
  bag and leaves the always-shared block. Over-redacting is the safe direction to be wrong in;
  the upgrade path is a `Ruleset.redactCharacter` seam, noted in place.

### Combat writes, until TC-P04

`PUT /combats/:id` still takes a whole record, so a player's write is judged as a diff by
`server/combatPolicy.ts`. Their copy legitimately omits the combatants they cannot see, so the
submitted roster must match *exactly* what they were shown — anything else is refused rather
than merged away, because a write that silently changed nothing must not answer as though it
worked.

Allowed: their own combatant's health, conditions, state and death saves; damage to a creature;
targeting; ending their own turn, with the round advancing by one.

Refused: adding, removing or reordering combatants; revealing a hidden creature; editing
initiative, names, entity types or a combatant's source; starting or ending the fight; taking
someone else's turn; touching another character's health, conditions or death saves.

Still open, and TC-P04's: dice are rolled on the client, so a player still decides how much
damage their own attack did. That is fixed with server-side dice, not a bigger diff.

### CSRF, CORS and the topology

The deployment is same-origin — in development Vite proxies `/api`, so the browser makes no
cross-origin request at all. **No CORS headers are emitted**, deliberately: there is no
cross-origin caller to permit.

`SameSite=Strict` already means a cross-site request arrives with no cookie and therefore no
authority. On top of that, an unsafe method must state `Sec-Fetch-Site: same-origin` or carry
an `Origin` in an explicit allowlist. `TC_ALLOWED_ORIGINS` refuses `*` at startup.

### Contract changes, documented

Four routes added to `apiContract.ts`, and `Repositories` gained `auth` plus
`campaigns.acceptInvite`. Both implementations satisfy them; no screen's read or write changed
shape.

| Route | Why |
| --- | --- |
| `POST /auth/sign-in` | There was no way to become anybody |
| `POST /auth/sign-up` | There was no way for anybody to exist. No approved screen calls it yet |
| `POST /auth/sign-out` | A session has to be endable |
| `POST /invites/:code/accept` | The invite code was checked for length and never resolved |

`TC_DEV_USER_ID` — TC-P01's identity shim — is gone, and the server now **refuses to start** if
it is still set, rather than quietly signing everybody in as one account.

### Frontend, minimally

`SessionProvider` gained `signIn` and `signOut` and still holds no credential. Sign-in posts and
navigates; joining redeems a code and navigates; both render the server's own sentence on
failure. A `RequireSession` wrapper sends a signed-out visitor to the door — a convenience, not
a control, and its comment says so. `permissions.ts` gained a header explaining that it states
the rules and the server enforces them.

Six seeded demo accounts can be signed into with `table-companion-dev`; the DM is
`marta@example.test`. That password is committed because it opens invented characters on a
localhost database, and the seed refuses to run when `NODE_ENV=production`.

### Tests — 304, all passing (37 new)

`server/combatPolicy.test.ts` — 12, no database. Every allowed action and every refused one,
including the two that look legal: winding the round without ending a turn, and setting another
character's state outside a turn change.

`server/auth.test.ts` — 11, needs a database. A password verifying against its own hash and
nothing else, and two hashes of one password differing; the cookie's `HttpOnly`, `SameSite` and
`Path` attributes asserted from the header itself; the sign-in body containing no password, no
hash and no token; a wrong password and an unknown address being byte-identical answers with no
cookie; sign-up refusing a duplicate address case-insensitively, a short password and a
malformed one; sign-out revoking the row so the old cookie proves nothing, and succeeding twice;
an expired session and a made-up token both failing; **every route that is not explicitly
anonymous answering 401 without a session**, walked from the route table; the anonymous set
being exactly the three that mint or drop a session; and a cross-site write refused while a
cross-site read is not.

`server/authorize.test.ts` — 13, needs a database, all written from the attacker's side. The
five shapes the prompt names: horizontal escalation (another account's campaigns, characters,
drafts, recents, activity, live combat); direct-ID access (campaign, character, encounter, user
— all `null`, and the user directory scoped to who you share a table with); DM-only actions
(every encounter operation, starting a fight, another user's homebrew); character privacy (a
hidden section's `systemData` gone for a party-mate, intact for the owner and the DM, and the
roster read redacted the same way); and secret rolls (absent from a player's log, and a player's
claim to roll in secret recorded as `party`). Plus an unrevealed creature absent from a player's
combat payload, a forged owner replaced on write, the combat-write policy through the real
store, and invite redemption — including a wrong code and a revoked code answering identically.

With `DATABASE_URL` unset, 41 tests skip and 263 pass.

### Checks run

`npm run typecheck`, `npm run lint` (0 findings), `npm run format:check` (clean),
`npm run build` (418.75 kB entry / 130.77 kB gzip — up 1.4 kB for the session wiring), and
`npm run test` twice: **304 passing** with a database, **263 passing / 41 skipped** without.

Exercised live against the real database, with the server running:

- anonymous `GET /me` and `GET /monsters` → 401
- wrong password → 401, the same sentence as an unknown address, and no `Set-Cookie`
- `Set-Cookie: tc_session=…; Path=/; HttpOnly; SameSite=Strict; Expires=…` observed on the wire
- a player signing in and being refused the DM's campaign list and the campaign's encounters (403)
- a player's `PUT /combats/:id` with `status: 'ended'` → 403
- a cross-site `POST /campaigns` with a valid session cookie → 403
- sign-out → 204, and the same cookie → 401 afterwards

### Not done, and deliberately so

- **No rate limiting on sign-in**, and no security response headers. TC-P03, with the rest of
  the hardening.
- **No runtime body validation.** A JSON body is still cast, not parsed. TC-P03.
- **Client-side dice and client-minted roll ids.** TC-P04.
- **No account-creation, password-change or account-deletion screens.** The endpoints for the
  first exist; `revokeAllSessions` is written and unused, waiting for a password change to call
  it. TC-P07.
- **Sign-up leaks whether an address is registered**, because it must in order to be usable.
  The fix is email verification, which is TC-P07's.

### Next eligible prompt

**TC-P03** — API contract runtime validation and hardening.

## TC-P03 — API contract runtime validation and hardening

TC-P00's gap category E is closed, and the boundary now has the things a production API needs
beyond correctness: codes, correlation, limits and bounds.

### One schema strategy, used on both sides

`src/domain/data/schema.ts` is a small combinator library; `contractSchemas.ts` declares every
shape that crosses the wire, once, and builds it twice.

| Direction | Strictness | Why |
| --- | --- | --- |
| Request → server | **Strict** | An unrecognised key is an over-post — a field nobody meant to accept. It is a 400 naming the field, not something ignored |
| Response → client | **Lenient** | A deployment ahead of this build has grown a field. Dropping it is right; failing the user is not |

The schemas live under `src/domain/data/` rather than in `server/` because both halves need
them — the same argument that made `types.ts` the wire format instead of a DTO layer. Combinators
rather than a dependency, for the reason everything else here is: the surface is a few dozen
fixed shapes and this is two hundred lines with no transitive anything.

`as T` is gone from `httpRepositories.ts`. Every response is validated before it reaches a
screen, so a drifted deployment or a mangled body is an `ApiError` at the boundary rather than
an `undefined` three screens later.

Bounds are part of the shapes. Every string has a maximum and every array a ceiling — a body
under a megabyte is not a constraint on a fight with fifty thousand conditions on one goblin.

### Errors have codes

Every failure answers `{ error: { code, message, requestId, details? } }` and nothing else.
Nine codes, listed in `apiContract.ts`: `unauthenticated`, `forbidden`, `not_found`, `conflict`,
`validation_failed`, `rate_limited`, `payload_too_large`, `not_supported`, `internal`.

The code is the contract; the message is for people and may be reworded. `details` names fields
and never values, so a rejected password cannot be quoted back — asserted by a test that sends a
secret in an invalid field and checks it appears nowhere in the answer.

**A frontend defect from TC-P02 fell out of this.** `httpRepositories.request` synthesised its
own message and never read the server's, so the sign-in screen built in TC-P02 would have shown
"POST /auth/sign-in failed (401)." instead of "That email and password do not match an account."
It now reads the code and the sentence the server wrote.

### Correlation and logs

Every response carries `X-Request-Id` — echoed from the caller when it is short and boring,
minted otherwise — and the same id is in the error body and the log line. One JSON line per
request: timestamp, level, request id, method, **route pattern**, status, duration, account.

Never a body, a cookie, a token, a query string or a resolved path. The pattern is logged rather
than the URL precisely so no id, invite code or search term is written down. A test asserts a
password, a session cookie, a query value and a campaign id are all absent from what was logged.

### Limits and bounds

| Class | Budget | Why |
| --- | --- | --- |
| `auth` | 10 / 15 min | The only endpoint where guessing repeatedly is worthwhile — and scrypt makes each guess expensive for the server too |
| `invite` | 20 / hour | The other endpoint where guessing a code is the attack |
| `roll` | 600 / min | A fight is fast, but not this fast |
| `write` | 600 / min | Autosave debounces at 400–500ms, so this is far above real use |
| `read` | 3000 / min | A backstop against a runaway effect loop |

Counted by account where there is one and by address where there is not, which is the case
sign-in has to hold. `X-Forwarded-For` is believed only where `TC_TRUST_PROXY` says a trusted
proxy rewrites it. In-memory, and the file says plainly that this is per-process and needs a
shared counter the moment there are two.

Pagination: `monsters.list` gained `offset` and is capped at 200 whether or not a limit was
asked for; `monsters.count` stays unbounded, so a truncated page shows up in the library's
"N of M" line rather than silently. A combat's roll log reads at most 500; the two home feeds cap
at 100.

### Idempotency, stated

`PUT` takes the whole record and is idempotent by construction — that is what makes autosave and
a retry safe, and it was already the documented policy in `repositories.ts`. `POST` mints an id
and is not, which is why the same file tells callers to wait rather than retry a `create`.

The one retry-sensitive `POST` is `rolls.record`, and TC-P01 got it half right: a colliding id
was always re-minted, so a client resending a roll it never saw acknowledged produced two. The
two cases look identical from the server and need opposite answers, and comparing the payload is
what separates them:

- same id, same roll → a **retry**. The stored roll is returned.
- same id, different roll → a **collision** between two devices. Kept, under a server-minted id.

TC-P04 mints ids server-side and the collision half stops being reachable; the retry half stays.

### Same-origin, reconciled explicitly

The page and the API share an origin, so **no CORS header is emitted at all** and the session
cookie is `SameSite=Strict`. That is the default and the one to keep.

A cross-origin deployment is now a deliberate switch rather than an undiscussed possibility.
`TC_CROSS_ORIGIN=true` requires `TC_ALLOWED_ORIGINS`, emits CORS with credentials and answers
preflight, and forces `SameSite=None` — which browsers only accept on a `Secure` cookie, so the
server **refuses the combination outside production** at startup rather than letting it fail
silently in a browser.

Standing headers on every API response: `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`, `Cache-Control: no-store`.

### One defect found and fixed

Refusing an oversized body left the connection in a state the next request on it was parsed out
of — a 2 MB upload followed by any request produced `ECONNRESET`. A response that stops reading a
body now sets `Connection: close`, which is the only correct end to a refused upload.

### Contract changes, documented

| Change | Effect |
| --- | --- |
| Error body is `{ error: { code, message, requestId } }` | Was `{ error: string }`. `httpRepositories.ts` updated in the same step; `ApiError` gained `code` and `requestId`, and `retryable` now keys off the code as well as the status |
| `MonsterQuery.offset` | New optional field. `queryFor` sends it; the server parses and bounds it |
| `X-Request-Id` accepted and echoed | New header, optional in both directions |
| List ceilings | `monsters.list` caps at 200 even unasked; rolls at 500; feeds at 100 |

No route was added, removed or renamed. No screen's read or write changed shape.

### Tests — 338, all passing (33 new)

`src/domain/data/schema.test.ts` — 17, no database. The combinators: bounds that bite, `NaN` and
`Infinity` refused, a numeric string not accepted as a number, `optional` versus `nullable`,
issue paths that name `rows.1.value`. Then strict-versus-lenient: an over-post refused by field
name, an unknown key dropped rather than fatal, and — the property the route handlers depend on —
an unknown key unable to survive even when it is not an error. Then credentials neither trimmed
nor lower-cased, an empty body meaning empty, a create body unable to smuggle `inviteCode`, and
`visibility` / `origin` refused rather than defaulted. Finally **every fixture in the demo world
pushed through its strict schema** — 2 campaigns, 6 characters, 51 creatures, 13 encounters, 3
combats, 4 rolls — plus a fight round-tripped through JSON and validated leniently.

`server/hardening.test.ts` — 16, needs a database. Success with its standing headers and no
CORS; a correlation id echoed when boring and replaced when not; malformed JSON, a wrong type,
an over-post and an unexpected body all 400 with `validation_failed` and a `details` naming the
field; a 2 MB body 413; a signed-out caller 401; an unknown path 404 `not_supported` while an
unknown record reads `null` at 200 on purpose; two conflicts; every code checked against the
contract's list; the roll retry and the roll collision; the limiter's window and key rules as a
unit; sign-in rate limited with a `Retry-After`; and a log line asserted to contain no password,
no cookie, no query string and no resolved path.

Three existing tests were updated because the behaviour they asserted changed on purpose: the
seams contract-path test was answering `{}` to every call and was lying about the contract, and
two parse tests now expect the page ceiling.

### Checks run

`npm run typecheck`, `npm run lint` (0 findings), `npm run format:check` (clean),
`npm run build` (429.53 kB entry / 133.88 kB gzip — up 10.8 kB raw, 3.1 kB gzipped, which is
what runtime validation on the client costs), and `npm run test` twice: **338 passing** with a
database, **283 passing / 55 skipped** without.

Exercised live against the real database with the server running:

- `sign-in → 200` with `X-Request-Id` present, `nosniff`, `no-store`, and **no** CORS header
- malformed JSON → `400 validation_failed`
- over-post → `400` with `details: "inviteCode: is not a known field"`
- wrong types → `400` with `"id: must be a string; campaignId: must be a string; … (and 4 more)"`
- unknown path → `404 not_supported`; signed out → `401 unauthenticated`
- `?limit=5&offset=2` → 5 rows; unpaged → 51; `count` → 51
- an inbound `X-Request-Id: trace-live-1` echoed back
- the tenth sign-in attempt → `429 rate_limited`, `Retry-After: 900`
- stdout carrying one JSON line per request, with the route pattern and no path

### Not done, and deliberately so

- **Combat is still not server-authoritative.** Client dice, client-minted roll ids, whole-record
  `PUT`, and `combats.version` maintained but unchecked. TC-P04.
- **The rate limiter is per-process.** A shared counter belongs with horizontal scaling. TC-P09.
- **No metrics and no error reporting.** `/health` and structured request logs exist; the rest of
  observability is TC-P09.
- **The library screen does not page.** The server caps at 200 and the count is honest about it;
  a paging control becomes necessary when the ingest pipeline lands. TC-P06.

### Next eligible prompt

**TC-P04** — server-authoritative combat and concurrency.

## TC-P04 — Server-authoritative combat and concurrency

TC-P00's gap category D is closed. `PUT /combats/:id` and `CombatRepository.save` are gone, and
nothing computes a fight's next state except the authority holding it.

### A fight changes by command

`POST /combats/:combatId/commands`, body `{ commandId, expectedVersion, command }`.

Twenty-two commands in [src/domain/combat/commands.ts](src/domain/combat/commands.ts), grouped
by what they touch: lifecycle (`combat.begin` / `end` / `reopen`), turn order (`turn.next`,
`previous`, `jump`, `move`, `resort`), initiative (`initiative.set`, `initiative.roll`), health
(`health.damage`, `heal`, `override`), `state.override`, conditions (`condition.add` /
`remove`), `target.set`, `deathSave.roll`, roster (`participant.rename` / `visibility` /
`remove`), and `undo`.

A command says what a caller is trying to do. It carries no resulting state and has nowhere to
put one — the schema is strict, so `{ kind: 'health.damage', participantId, amount, finalHp }`
is a 400 naming `finalHp`. What an amount does to a track with temporary hit points on it, when
a character drops unconscious, what order initiative sorts in, whether a death save at three
failures is fatal: all of it is worked out from the stored fight, by the ruleset.

**One reducer, not two.** `applyCommand` is a pure function that delegates to the same
`actions.ts` / `turns.ts` / `setup.ts` transforms the screens have always used. Those three
modules moved from `src/screens/combat/` to `src/domain/combat/` so both halves share one
implementation rather than the server growing a second copy of the rules. The reducer names no
game system: every rules question goes to `Ruleset`, and a condition key the adapter does not
know is refused rather than invented.

### Concurrency, retries and conflicts

Every command runs in one transaction in
[server/combatService.ts](server/combatService.ts), in this order:

| Step | What it stops |
| --- | --- |
| `SELECT … FOR UPDATE` on the fight | Two commands interleaving. They serialise; both land |
| `commandId` already in the history? | A retry after a dropped response becoming a second hit. Answered with the current state, `replayed: true`, and nothing applied |
| `expectedVersion` equals stored `version`? | Last-write-wins. A stale writer gets `409 conflict` naming both versions and is told to refresh |
| Compute from the **stored** fight | The client's arithmetic being trusted |
| Write fight + participants + one audit row | A fight and its history disagreeing |

The command id is checked **before** the version, which is the ordering a retry needs: a client
that never saw the answer still holds the old version, and its resend must be recognised rather
than refused as stale.

Conflict behaviour is deterministic and stated: refuse, do not merge. Both combat screens catch
`conflict`, say so in a sentence and re-read. There is no path that reconciles two writers by
guessing.

A command answers with the fight **re-read from the database**, not with what the reducer built,
so the answer to a command and the answer to a refresh are the same bytes by construction.

### Undo

Every reversible command records what one participant looked like before it — health, state,
death saves, conditions. Undo restores that, and only that:

- **Reversible only.** A turn advance and a fight ending record nothing to restore, and undoing
  one is refused.
- **Once.** The original is marked `undone_by_seq`; a second attempt is a `conflict`.
- **Nothing is deleted.** Undoing appends a new event with `undoes_seq`; the row it corrects
  stays exactly where it is. The log a DM reads back at the end of a session only ever grows.
- **Later changes survive.** Restoring one participant rather than a whole-fight snapshot is
  what makes undoing a hit from three rounds ago safe — a test hits one creature, does three
  unrelated things, undoes the first hit, and asserts the other three are untouched.

Undo is a DM command. `canPlayerIssue` refuses it, along with everything else about the fight
itself.

### Dice that move state are the server's

`initiative.roll` and `deathSave.roll` carry no number and have nowhere to put one; the server
rolls from the ruleset with its own `RandomSource`. Both are asserted against the stored audit
payload, which is `{ kind, onlyMissing }` and `{ kind, participantId }` and nothing else.

**Still open, and named in the file:** a free-form attack roll is evaluated on the client and
lands through `health.damage`, so a player still chooses how much damage their own attack did.
The server decides what that damage *does*; it does not yet decide what the die came up as for
an attack. Closing it needs the ruleset to resolve an action end to end — an action id, a
target, and the adapter deciding the damage — which is a change to the `Ruleset` seam rather
than to this command set.

### Authorization, as a question about intent

TC-P02 had to diff the fight a client sent against the one it was shown, because a whole-record
write does not say what it meant. A command does, so `canPlayerIssue` asks about the intent
instead. It is shorter, and it cannot be fooled by a change nobody thought to look for.

A player may damage or heal their own combatant or a creature, condition their own combatant,
target anyone, roll their own death save, and end their own turn. Everything else — lifecycle,
turn order, initiative, overrides, the roster, undo, another character's state, another
character's death save — is the DM's. `server/combatPolicy.ts` and its diff tests are deleted;
the rule and its tests live with the commands.

### Screens

`CombatScreen` owns one writer, and that writer computes nothing: `send(command)` posts the
intent with the version it was working from and replaces local state with what comes back.
`CombatSetup` and `CombatRunner` take `onCommand` instead of `onChange`; `PlayerCombat` sends
`deathSave.roll`, `turn.next`, `target.set` and `health.damage`. Between them the three screens
lost every local mutation of a fight — what remains of the transform imports is one read,
`targetedParticipant`.

Fixtures run the same reducer, with real version, replay and stale-version behaviour, so
developing with no server at all exercises the same paths.

### Contract changes, documented

| Change | Effect |
| --- | --- |
| `PUT /combats/:id` **removed** | `POST /combats/:id/commands` replaces it. A `PUT` to the old path is now `404 not_supported`, asserted by a test |
| `CombatRepository.save` **removed** | Replaced by `command(input)`. Both implementations and every caller updated in the same step |
| `CombatInstance.version` | New. Carried on every read, sent back with every command |
| `combat_events` columns | `command_id` (unique per combat), `undo_restore`, `undoes_seq`, `undone_by_seq`, `summary`, `version` — migration `003_combat_commands.sql` |
| `withRealtime` | Announces a command unless it was a replay: a retry that changed nothing must not make every other device re-read |

### Tests — 355, all passing (28 new)

`src/domain/combat/commands.test.ts` — 13, no database. The reducer: the amount is stated and
the arithmetic is not the caller's; damage floors at zero and downs a character; a non-integer
or negative amount is refused; a condition the ruleset does not know is refused rather than
invented; the same die always gives the same death save and two different dice give two
different totals; a fight that has not started has no turn to advance and an ended one takes
nothing but `reopen`; a reversible command records what to put back and an irreversible one
records nothing; a combatant who is not in the fight cannot be commanded. Then the permission
rule, replacing the deleted diff policy: what a player may do, the fifteen commands that are the
DM's, another character's state and death save refused, the own-turn rule, and a walk over every
command kind so a new one gets a deliberate verdict rather than an oversight.

`server/combatCommands.test.ts` — 15, needs a database. Two commands issued at the same version
(one lands, one is refused `409`, the retry lands, neither is lost); a stale version refused
deterministically three times over with the fight unmoved; a retried `commandId` recognised —
same `seq`, one audit row, five damage not ten; a turn advance and damage racing each other with
both surviving; undo restoring exactly and keeping the history with `undoes_seq` / `undone_by_seq`
set; a double undo refused; an irreversible change refused; **undo leaving three later unrelated
changes alone**; initiative and death saves rolled by the server with the audit payload asserted
to carry no number; every accepted command leaving exactly one ordered audit row carrying the
version it produced; a refresh returning byte-identical state to what the command answered;
a command against a fight that is gone as a `404`; a refused command rolling the whole
transaction back including its history; and a participant who left refusing to be commanded.

Four existing test files were updated off the removed `save`.

### Checks run

`npm run typecheck`, `npm run lint` (0 findings), `npm run format:check` (clean),
`npm run build` (444.89 kB entry / 138.33 kB gzip — up 15 kB, the command union, its schema and
the shared reducer now reaching the browser), and `npm run test` **three times**: 355 passing
each time with a database, 285 passing / 70 skipped without.

Exercised live against the real database with the server running:

- `PUT /combats/:id` → `404 not_supported` — the unsafe path is gone, not deprecated
- `health.damage 3` → `200`, hp 481 → 478, `version` 1 → 2, `seq` 2
- the same version again → `409 conflict`
- the same `commandId` again → `200 replayed: true`, one hit not two
- `undo` → hp restored; `undo` again → `409 conflict`
- `initiative.roll` → six numbers the request never carried
- `GET /combats/:id` byte-identical to the command's answer
- an over-posted `finalHp` → `400 "command.finalHp: is not a known field"`

### Not done, and deliberately so

- **No realtime.** A second device learns about a change by re-reading, not by being told.
  TC-P05, and explicitly out of scope here.
- **A free-form attack roll is still the client's.** Named above and in `commands.ts`.
- **`turn.next` is the only turn command a player may issue.** Nothing in the design gives them
  another, and widening it would be a product decision rather than a security one.

### Next eligible prompt

**TC-P05** — realtime WebSocket sync and recovery.

## TC-P05 — Realtime sync and recovery

TC-P00's gap category F is closed. A deployment now tells the other devices at the table that
something committed, over an authenticated stream the server scopes and filters.

### Server-sent events, not a WebSocket

The prompt allows "WebSocket **or equivalent**", and the equivalent is the better fit here
because of what an event in this product has been since TC-13: a **notification, never a
payload**. The receiver is told what changed and re-reads through the repository. That makes the
traffic one-way, and a WebSocket would have bought a client→server channel nothing uses at the
cost of a dependency (Node has no WebSocket server), an upgrade handshake and a framing layer to
get wrong.

`EventSource` is a platform API on both sides of that trade. It runs on the HTTP server that
already exists, carries the session cookie exactly like every other request, and already does
reconnect and `Last-Event-ID` replay — the two behaviours this slice would otherwise have had to
write and keep in step with a server-side schedule.

### The stream

`GET /events[?campaignId=…]` → `text/event-stream`.

| Concern | Behaviour |
| --- | --- |
| Authentication | The session cookie, resolved before a byte is written. No session is a 401 |
| Subscription | **Granted, not requested.** The rooms are the campaigns the account is a member of, read from stored rows. `?campaignId=` may narrow and never widen; naming one you are not in is a 403, not a room that quietly delivers nothing |
| Audience | Decided per event. `members` or `dm` |
| Heartbeat | A `: ping` comment every 25 seconds, so a proxy does not close an idle stream |
| Reconnect | The browser's, at the `retry:` interval the server states — one schedule, stated once |
| Stale connections | Dropped on socket close and on the first failed write. A publish never takes a command down with it: the write already committed |

### Nothing is announced before it commits

`withServerEvents` wraps the **authorized** repositories, outermost, and every publish is after
an `await` on the store — and the store's promise resolves after `COMMIT`. So a subscriber that
re-reads on an event can never read state a transaction later rolled back, and the ordering is
structural rather than a thing to remember. A replayed command announces nothing, because
nothing changed.

The client half changed to match: `withRealtime` now returns the repositories untouched when the
channel's `authority` is `server`. A client announcing a write it merely *sent* is a client
inventing an event — only the server knows one landed.

### Filtering, per recipient

- **A secret roll is not announced to a player at all.** TC-13 argued the event was harmless
  because it carries no total; it is not — "the DM just rolled something" is the information.
  The audience comes from the same `canSee` predicate that keeps the roll out of a player's log.
- **An encounter edit is DM-only.** A template carries setup notes, so telling a player it
  changed is telling them it exists.
- Combat and campaign changes go to every member, which is what a fight is.

### Recovery, and what the stream is not

The hub keeps a bounded replay window (200 events per campaign). A reconnecting client sends
`Last-Event-ID` and is handed exactly what it missed, in order, filtered by its own audience.

When the gap is wider than the window the answer is `event: resync` — a `sync.required` domain
event — and **not** a partial history. Reconstructing state from events you know are incomplete
is how a client ends up confidently wrong; the database is one read away and is authoritative.
`useRealtime` delivers `sync.required` to every subscriber whatever kinds it asked for, so a
screen that already knows how to re-read needs no new code to recover.

Duplicate and out-of-order delivery are harmless by construction, and tested as such: an event
carries no state, so applying one twice is two reads with the same answer, and replay is sorted
by sequence before it is written.

### Connection states

`useConnection` gained `resyncing` beside `restored`. They are different things: `restored` is
the socket coming back, `resyncing` is the screen being stale while the socket was fine. Both
clear themselves after four seconds and neither blocks anything — a command carries the version
it was built from, so a stale one is refused by the server rather than by a banner that stopped
somebody acting. Both combat screens render the new state.

### The development adapter, kept and named

`createLocalChannel` (`BroadcastChannel`) is unchanged and is now explicitly the development
adapter: `authority: 'local'`, which is what makes `withRealtime` publish there and stay quiet
against a server. With `VITE_REALTIME_URL` unset the app still keeps a DM tab and a player tab
in step on one machine, and is honest that it reaches nothing else.

The speculative `createSocketChannel` — written at TC-13, never connected to anything — was
replaced by `createEventStreamChannel` rather than kept alongside.

### Tests — 366, all passing (11 new)

`server/realtime.test.ts`, against a real database and a real HTTP server, with two independent
sessions and raw stream readers (a client library cannot assert what was *not* sent):

A DM and a player both receiving a committed change, and the damage that follows it · an
encounter edit reaching the DM and not the player · **a secret roll not announced to a player at
all**, with an open roll reaching both so the filter is a filter rather than a mute · a stream
refused without a session (401) and refused onto another account's campaign (403), and an
outsider's stream carrying nothing · replay handing back what was missed, in order, filtered by
audience · a current client handed nothing and the same window replayed twice being identical ·
a gap wider than the window answered with nothing to replay · visibility deciding audience ·
**a reconnecting client handed exactly what it missed and not told to start over** · a client
that fell too far behind told to re-read once · a stream dropped from the hub when its socket
closes.

### Checks run

`npm run typecheck`, `npm run lint` (0 findings), `npm run format:check` (clean),
`npm run build` (444.98 kB entry / 138.34 kB gzip — up 0.09 kB; `EventSource` is a platform API,
so the channel is smaller than the WebSocket client it replaced), and `npm run test`: **366
passing** with a database.

### Not done, and deliberately so

- **The hub is per-process.** Two instances would each broadcast only to their own subscribers.
  The fix is a shared bus — PostgreSQL `LISTEN/NOTIFY` is already in the box — and it belongs
  with the horizontal-scaling work in TC-P09 rather than as speculative infrastructure before
  there is a second instance to need it. Said in `main.ts` where it is created.
- **Monsters and drafts announce nothing.** A homebrew creature is personal to its owner and a
  draft is a half-built character nobody else can see, so neither has an audience to tell.
- **The replay window is memory, not a durable outbox.** That is the deliberate shape: the
  window is a convenience for a client that blinked, and the honest answer beyond it is
  `sync.required`.

### Next eligible prompt

**TC-P06** — rules content pipeline and legal boundary.

## TC-P06 — Rules content pipeline and legal boundary

TC-P00's gap category H is closed. Rules content is imported from an approved source into
normalised storage, every record is traceable to a source and a licence, and the adapter reads
its catalogue from that rather than from literals it used to hold.

### The legal boundary, enforced rather than recorded

**Only content whose licence explicitly permits redistribution is imported into production.**
`server/content/import.ts` refuses anything else by name, with the reason, and there is no flag
that overrides it when `NODE_ENV=production`.

The rule the boundary encodes: **mechanics are not the question, redistribution is.** Nobody
needs permission to write software that adds a modifier to a die roll; shipping somebody else's
*text* needs a licence that says so.

| Source | Verdict |
| --- | --- |
| **System Reference Document 5.1** | **Approved** — CC BY 4.0 permits redistribution with attribution |
| The operator's own content | Approved — theirs |
| 5e.tools and equivalent community datasets | **Blocked** — aggregates published material far beyond the SRD under no redistribution licence |
| Published rulebooks | **Blocked** — copyrighted text, much of it Product Identity |

The verdicts are code, in [licenses.ts](src/domain/content/licenses.ts), so "why is that not
imported" has one answer in one place.

**`Requirements.md` §6.35 is met differently, and said so.** The requirement names 5e.tools as
the expected source. It cannot be met that way in production. The requirement's intent — a real
ingest pipeline rather than typed-in data — is met from the SRD, and
[REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) now says that rather than carrying
**Blocked** with no plan.

**Two creatures were quarantined.** Running the pipeline over the existing hand-authored library
found **Beholder** and **Mind Flayer**: Product Identity, named in no licence this product holds,
and previously labelled "Monster Manual" and shipped. They are in `content/quarantine/`, the
importer refuses that bundle, and `content.test.ts` asserts neither reaches a library. The other
48 are marked `srd-5.1` and `content/README.md` carries an explicit operator task to confirm each
name against the SRD index before launch — the pipeline makes that a data change with no code.

### A source-agnostic content model

`src/domain/content/` — generic, and it names no game system.

A `ContentRecord` states what the core needs — system, category, name, source — and puts
everything else in a `data` bag the core never reads. The categories (`class`, `species`,
`background`, `feat`, `spell`, `equipment`, `monster`, `other`) are *slots* every system in scope
has, not D&D words: a species and an ancestry are the same slot.

| File | What |
| --- | --- |
| [model.ts](src/domain/content/model.ts) | `ContentRecord`, `SourceRef`, `LicenseRef`, `ContentLibrary`, attribution |
| [licenses.ts](src/domain/content/licenses.ts) | The approved list, and the verdict on every source considered |
| [validate.ts](src/domain/content/validate.ts) | Per-record validation, duplicate handling |
| [bundles.ts](src/domain/content/bundles.ts) | The one place a bundle file is read |
| [monsters.ts](src/domain/content/monsters.ts) | Creatures, which have a core shape and so need no adapter |

### The adapter loads content, and no longer holds it

`builder.ts` shed ~520 lines of literals — 8 species, 6 backgrounds, 8 classes, 4 fighting
styles, 4 equipment packs and every spell list. `monsterLibrary.ts` and `monsterDetails.ts`
(1,272 lines) are **deleted**. All of it is bundles now.

[ruleset/dnd5e/content.ts](src/domain/ruleset/dnd5e/content.ts) is the only place the D&D shapes
and the generic model meet: it filters the library by `systemId` and reads each `data` bag back
as the `SpeciesDefinition` and `ClassDefinition` the adapter already expected. `useContentLibrary`
is how a deployment points the adapter at what it imported rather than what was bundled.

The test that proves it is not a re-declaration: swapping in an empty library makes
`content.classes()` return nothing. A constant would not have noticed.

### The pipeline

`npm run content:import` — deterministic by construction:

- **Reproducible.** Same bytes → same rows and same `content_hash` (line endings normalised). A
  re-import of an unchanged bundle reports `unchanged`.
- **Replaced, not merged**, scoped to the bundle. A record a bundle dropped disappears; a record
  from the source's *other* bundle survives. That last part was a bug found by a test: two
  bundles from one source wiped each other until `bundle_id` existed.
- **Validated per record.** One malformed entry is refused by name and the rest import.
- **Duplicates named.** First key wins, the rest are reported.
- **Atomic.** Source row, delete and inserts in one transaction.

Storage is migration `004_content.sql`: `content_sources` (with the licence denormalised onto it,
so an imported record stays answerable if the code's registry changes) and `content_records`
(`system_id`, `kind`, `key`, `data` — one table for every ruleset). `monsters` gained `source_id`
and `license_id`.

**Source-shape parsing lives in `server/content/` and nowhere else.** No UI component and no
generic domain module knows what an SRD record looks like.

### Adding another ruleset

Documented in [content/README.md](content/README.md), and the property is tested: a record from
another system sits in the same library as a D&D one, and each adapter sees only its own.

Four steps, none of which touch the core: write bundles with your `systemId`, add a licence
verdict if the source is new, write the adapter's content module (the equivalent of
`ruleset/dnd5e/content.ts`), register the adapter. No schema change, no new column, no widened
generic interface.

### Tests — 390, all passing (24 new)

`src/domain/content/content.test.ts` — 15, no database. The licence list and its refusals with
reasons; attribution travelling with the content; a bundle that does not validate; an invalid
record refused by name while the rest survive; a duplicate key dropped once and reported; a key
that is a key rather than a sentence; the `data` bag checked as an object and no further; the
index; the shipped catalogue being real and entirely redistributable; **the builder reading the
library rather than a constant**; a representative build path (fighter, human, soldier, fighting
style, pack) resolving from content; spell lists rebuilding from flat records; creature actions
surviving the round trip with the ruleset still building their rolls; Product Identity absent;
and two systems in one library staying out of each other's way.

`server/content/import.test.ts` — 9, needs a database. The licence gate refusing in production
and refusing without the flag outside it, and writing nothing either way; a development-only
source loaded and still filtered out of what a deployment serves; the same bundle producing the
same hash and not accumulating; line endings not changing a hash; duplicates; a bad record
refused while the rest import; **a newer source revision replacing rather than accumulating** —
renaming one record, dropping another, changing a third, and the version moving; the shipped
bundles importing and the adapter being pointed at the stored result; and no record without a
source.

### Checks run

`npm run typecheck`, `npm run lint` (0 findings), `npm run format:check` (clean),
`npm run test` (**390 passing**), and `npm run build`.

**The bundle got smaller.** Inlining the catalogue first pushed the entry chunk to 500 kB and
brought back the size warning TC-16 removed, so the content is its own chunk: entry
**411.04 kB / 128.78 kB gzip** (down from 444.98 kB), plus `content-*.js` at 89.77 kB / 13.62 kB.
A catalogue changes when a source is re-imported, not when a screen is edited, so a browser now
keeps it across deploys that did not touch it.

The pipeline was also run for real: `npm run content:import` imported 66 character records and
48 creatures from the SRD, and refused `content/quarantine/` with
*"Published rulebooks is not redistributable… Copyrighted text, and much of it Product Identity
that no licence covers."*

### Not done, and deliberately so

- **The 48 remaining creatures have not been checked entry by entry against the SRD index.** They
  are hand-authored stat blocks the project already had, marked as SRD on the strength of being
  SRD creatures. The operator task is written into `content/README.md` rather than assumed done,
  because being wrong in the permissive direction is the direction that matters here.
- **No feats.** The category exists in the model; the catalogue has none, because the working
  subset never did.
- **The bundles were generated from the catalogue that was already in the repository**, not
  extracted from the SRD document. That is what made the migration reproducible rather than a
  retyping exercise; pointing the importer at a full SRD extract is `--from=` and no code change.

### Next eligible prompt

**TC-P07** — product, account, offline and operational states.

## TC-P07 — Product, account, offline and operational states

The infrastructure of TC-P01…P06 is behind screens that were written against fixtures, where
a request never fails, a session never ends and a save always lands. This closes that gap.

### The defect this slice existed to fix

**The character builder reported a failed save as `Saved`.**

```ts
void drafts.save(next).then(
  () => setSaving('saved'),
  () => setSaving('idle'),   // ← and 'idle' rendered as "Saved"
);
```

Three screens autosaved and each had its own copy of that logic, drifted into three different
answers: `Saved`, `Not saved yet`, and — only in the encounter builder — a kept edit with a
retry. The first is the one that matters. Somebody answering eight questions has no way to
check; that line is the only evidence they have.

One implementation now, in [useAutosave.ts](src/app/useAutosave.ts), used by all three, with
the state machine as a plain object so the rule is *tested* rather than reviewed. What it
guarantees:

| | |
| --- | --- |
| A failed edit is **kept** | It stays pending, so the next edit and Try again both carry it |
| Leaving **flushes** | Every exit path writes what is queued — Create, Start, Done, unmount |
| Closing the tab **warns** | `beforeunload`, armed only while there is something to lose |
| A late response **settles nothing** | A response that arrives after the next edit was queued cannot report `Saved` about the wrong value |

It does not retry on its own. A screen nobody is looking at retrying in a loop is how a failing
deployment becomes a busy one.

### Sessions end, and the app finds out the way a person would

A session ends on the server's clock. The cookie is HttpOnly by design, so there is no expiry
timestamp here to watch and nothing to predict — what the client can know is the moment a call
comes back `unauthenticated`.

[sessionExpiry.ts](src/domain/data/sessionExpiry.ts) is that signal, reported once from the one
place that sees every response. `SessionProvider` **re-reads the identity** rather than assuming
the session is gone — one refused request is evidence, not proof — and only then sets `expired`.

- `auth.*` is excluded: a wrong password is a 401 about a credential, not about a session.
- An expiry that resolves leaves no banner: `expired` only means anything alongside `signed-out`.
- The sign-in screen says **"Your session ended"** rather than appearing over somebody's work
  for no stated reason.
- `RequireSession` carries `from`, so signing in returns you to the campaign you were reading.
  [returnPath.ts](src/app/returnPath.ts) honours only a same-origin path — the moment right
  after typing a password is the moment a redirect is least likely to be read.

### Account lifecycle

| Surface | What |
| --- | --- |
| `/signup` | Account creation. `auth.signUp` existed since TC-P02 and nothing consumed it |
| `/dm/account` | Display name, the data boundary, sign out |
| `PUT /me` | The one account field a person may change |

`PUT /me` is the first route that changes something about a *person*. It is scoped by the
session and not by anything the caller sent: no id in the path, none in the body, and the
schema is `strict`, so `{ displayName, id: <someone else> }` is **400 `validation_failed`** with
the field named — not a silent drop. Email and password are refused the same way: an email
change is a re-verification flow and a password change is a credential flow, and neither may
arrive as an extra key on a profile update.

The account screen **states the data boundary on the screen**, and each line is a claim about
the implementation rather than a policy sentence: the email address is in no response sent to
another player including the DM, the password is a hash the server cannot read back, a private
note is filtered before the response leaves the server. `account.test.ts` asserts the screen
still says each of them.

### Invite states

The server answers **one sentence** for invalid, expired, revoked and spent — deliberately, so
a stranger cannot use the join form to find out which campaigns exist. The screen shows what it
was told and offers the field again rather than guessing between them.

The two states it *can* distinguish, it now does:

- **Signed out** — an invite adds an account to a campaign, so there must be an account. Offered
  with the destination carried across, instead of a form that answers "Not signed in." and
  nothing else.
- **Joined** — named, with somewhere to go. Joining twice gives the same answer as joining once,
  because the server treats a second tap as a second tap, and telling them apart would mean
  asking who is already a member of what — a question somebody holding only a code should not
  be able to ask.

### Fixture-era assumptions removed

- **`<ConnectionStatus state="live" />`** in the party table, against every player. That is
  per-member presence, which this product does not have — the realtime hub tracks connections,
  not who is at the table. Replaced with what is real about a member: whether they have a
  character. Player home now reports the *actual* connection.
- **`window.location.reload()`** as three Try again buttons. A page reload throws away every
  other screen's state, the context panel and any queued autosave to fix one failed read.
  `useAsync` hands every caller a `reload`.

Both are now enforced by a test that walks every screen file, because both were the kind of
thing that reappears.

### Conflicts, in the product's own words

TC-P04 made a stale write a `409`. This is what a person sees:

| Screen | |
| --- | --- |
| DM | "Somebody else changed this fight first. Reloading it." |
| Player | "The table moved on while you were deciding. Catching up." |

Branching is on the stable `code`, never on a message; no status code, route or error object
reaches a screen. Nothing was changed optimistically, so nothing is lost — the fight on screen
is still the last one the authority confirmed, and the recovery is a re-read.

### Refresh and recovery

Not a local cache in any of the three cases, because the server already owns the state:

- **Character builder** — the draft is created before the first answer, so autosave has an id
  and a reload lands on the thing that exists.
- **Encounter builder** — the same, plus it takes over its own URL with `replace: true`, so the
  back button does not make a second encounter.
- **Combat** — every change is a command against a version; a refresh returns the authoritative
  fight, which is the property TC-P04 established and this slice depends on.

### Telemetry: a boundary, and nothing behind it

Provider-neutral, no secrets, not invasive — satisfied all at once by shipping the seam and no
provider. `noopSink` is the default and this build supplies nothing: no vendor script, no
network call, no identifier, no configuration that would need one.

What may be recorded is a **closed union**, not a string. An open `track(name, props)` becomes
invasive one careless call at a time, because the easiest thing to reach for at a call site is
whatever is in scope. Every event names *what happened, never who or what it happened to*:
`session_expired`, `save_failed` (with a document kind, not a document), `save_recovered`,
`combat_conflict`, `realtime_resynced`, `invite_rejected`.

A test asserts the union carries no id, name, email or free text, and that every event the
screens report is one the union declares.

### Accessibility

- One `SaveStatus`, `role="status" aria-live="polite"`, so a save is announced and not only
  coloured — and it is impossible to render the failure without the Try again beside it.
- The DM shell announces connection changes in words: offline, reconnecting, catching up, back
  in sync. Colour was the only signal before.
- The account screen announces its own save.
- Every dialog is a native `<dialog>` driven by `showModal()`, which is where the focus trap,
  the inert background, Escape and top-layer stacking come from. A test asserts no screen has
  grown a hand-rolled overlay.
- The player bottom bar is still five destinations — the design's thumb-reach limit — so the
  account is a full-size icon button at the top of Home rather than a sixth tab.

### Tests — 436, all passing (46 new)

`src/app/autosave.test.ts` — 9, no database. A failed write is never reported as saved, checked
on the state *and on the label a screen renders*, because the defect was in the words; a failed
edit kept and re-sent unchanged by Try again; the next edit carrying it; flush writing what the
debounce holds and cancelling the timer; flush with nothing queued doing nothing; unmount firing
rather than dropping; a slow response not reporting success over a newer edit; a run of failures
reported once and the recovery once; and subscribers notified on a change and only a change.

`src/domain/account.test.ts` — 16, no database. The expiry emitter; a 401 on an ordinary call
reported and a refused password *not* reported; `expired` meaning nothing without `signed-out`;
`returnPath` refusing an absolute and a protocol-relative URL; the redirect carrying `from`;
every invite state having a way forward; joining twice answering the same as joining once; the
account screen still stating each boundary claim; `updateSelfSchema` carrying `displayName` and
nothing else, strictly; a rename going through the seam and being trimmed; the default sink;
the event union carrying no identifier; the shipped build supplying no provider; and every
event the screens report being one the union declares.

`src/app/states.test.ts` — 15, no database. No screen asserting a connection state; no screen
reloading the page to recover a read; all three editors on the one autosave with no private save
state; every failure offering a retry; finishing flushing; drafts existing server-side before
they can be typed into; combat recovering from the server with no whole-record write; conflicts
explained without transport detail; statuses announced; the shell saying each connection change
in words; every dialog being a real one; the account reachable from both shells without a sixth
tab; and the player surface still at touch density.

`server/account.test.ts` — 6, needs a database. A rename, and `/me` answering with it; trimming,
and an empty name refused with the stored account untouched; a signed-out caller refused; **one
account unable to rename another** — the over-post refused by name, and the other account
verified unchanged; `email`, `password` and `passwordHash` each refused on the profile route;
and a rename returning no credential and exactly two keys.

### Checks run

`npm run typecheck`, `npm run lint` (0 findings), `npm run format:check` (clean),
`npm run test` (**436 passing** with `DATABASE_URL`; 344 pass / 92 skipped without one), and
`npm run build` — entry **413.01 kB / 129.29 kB gzip**, content chunk 89.77 kB, no size warning.

### One flaky test, found and fixed

Running the suite repeatedly surfaced an intermittent failure in
`a payload over the size limit is refused by name` — TC-P03's 2 MB upload check. It is not a
server defect: refusing before reading the body is exactly what that test asserts, and the
consequence is that the socket closes while the caller is still writing. `fetch` surfaces that
as a rejected promise and **loses the response the server already sent**, which is why it only
failed under load.

Rewritten over a raw `node:http` request, which lets the write fail and still reads the answer.
The assertion is unchanged and no weaker. Nine consecutive full-suite runs green since.

### Not done, and deliberately so

- **No password change, no email change, no account deletion.** Each is its own flow — a
  credential flow, a re-verification flow, a data-erasure flow — and shipping one badly is worse
  than not shipping it. All three are named on the account screen rather than left to be looked
  for, and the profile route refuses the fields outright.
- **No per-member presence.** Removing the invented "Live" badge was the honest fix; building
  real presence is a feature, not a state.
- **No offline queue.** Offline refuses a write and says so. Queueing writes to replay later
  would need conflict resolution the server deliberately does not offer — it refuses a stale
  command rather than merging it — so a queue would be a way to lose work quietly.

### Next eligible prompt

**TC-P08** — end-to-end multiplayer and negative security tests with two independent clients.

## TC-P08 — End-to-end, multiplayer, security and resilience

Everything TC-P01…P07 built had been verified from below: unit tests, store tests, HTTP tests.
This drives it from above, through two real browsers, and that difference found four defects
nothing underneath could have.

### What it found

**1. The browser sent `expectedVersion: 0` on every command.**

`combatSchema` had no `version` field. A response schema drops what it does not declare, so
every fight the browser parsed came back without one and `current.version ?? 0` sent zero every
time. The first command of a session landed; **every command after it was refused as stale,
forever**, with the fight reloading and the next one failing the same way.

Every server-side concurrency test in `combatCommands.test.ts` passed throughout, because none
of them goes through that schema. It took two browsers running a fight to see it. One line in
`contractSchemas.ts`.

**2. A signed-out browser asked the server who it was, forever.**

TC-P07's expiry signal re-reads the identity when a call comes back `unauthenticated`. The
re-read is itself such a call. On the sign-in screen that is a loop: **635 requests to `/me` in
fifteen seconds**, which also exhausted the machine's sockets and made three other tests look
flaky. `SessionProvider` now only reacts to an expiry when it believed there was a session, and
lowers that flag as it takes the signal — one ended session, one re-read.

`resilience.spec.ts` counts the requests, which is a test that could only ever live here.

**3. `POST /monsters` with an id that already exists answered 500** — with
`duplicate key value violates unique constraint "monsters_pkey"` in the log. A well-formed
request never gets a 500; it is a `conflict`, and the contract has a code for exactly that.

**4. The entry screens had no heading.** Sign in, sign up and join rendered the wordmark as a
`<span>`. A page with no heading cannot be oriented in by anybody navigating by headings. It is
an `<h1>` now, same pixels.

And one improvement rather than a defect: a route module that failed to load fell through to
**react-router's own developer error page**, which tells somebody at a table to add an
`errorElement`. There is one now, and it says what happened, that nothing was lost, and offers
Try again.

### Browser coverage — 37 tests, two independent contexts

Two `BrowserContext`s, two cookie jars, two viewports: the DM at 1440×900, the player at
390×844. Never two tabs — TC-P08 says so explicitly, and a suite that shares a session cannot
tell "the player sees it" from "the DM sees it".

| Spec | Tests | |
| --- | --- | --- |
| `smoke.spec.ts` | 4 | The harness: built bundle, same-origin API, real database, two distinct people |
| `golden-path.spec.ts` | 15 | The whole Phase 1 path |
| `resilience.spec.ts` | 9 | Refresh, restart, reconnect, resync, conflict |
| `a11y.spec.ts` | 9 | Desktop, tablet and phone |

The Golden Path, in order: the DM signs up, creates a campaign and reads its invite code; the
player signs up **in another browser**, joins with that code, and builds a character through
the guided builder — every step of it, driven generically, because the steps come from the
ruleset and a test that knew there were nine would break the day one was added. The DM builds
an encounter (the party is already in it; creatures are added), starts the fight, hides one
creature, rolls initiative and begins round one. The fight appears on the player's phone with
no reload. Damage, healing and a turn advance each reach both clients. Conditions, a DM
override, an undo, a second undo refused, and the fight ends for both.

### Privacy, in four places

TC-P08 says client-side hiding is not a pass, so nothing is asserted only on screen:

| Where | What |
| --- | --- |
| **The payload** | The hidden creature is *absent* from the player's `/combats/:id`, not marked in it. The secret roll is not in their roll list |
| **The DOM** | Neither name appears in `page.content()` — including anything CSS might be hiding — after a reload |
| **The realtime stream** | The player's screen never learns of either; the event that carried them chose a `dm` audience |
| **The logs** | The server's own log this run contains no password, no invite code, no session cookie and no `scrypt$`, and the route is the *pattern* (`/combats/:combatId/commands`) rather than the resolved path |

And the DM still sees both, or the test proves nothing.

### Adversarial API coverage — 24 tests, no browser

`server/adversarial.test.ts`, over real HTTP with real sessions. Every request is well-formed;
the attacker is not using the screen.

- **Id tampering** — an outsider commanding a fight by its id; reading a fight, encounter or
  campaign by id; rewriting an encounter; relocating one into another campaign; attaching
  somebody else's character.
- **Privilege escalation** — creating a campaign that names somebody else as DM (the server
  assigns the caller); redeeming an invite (always makes a `player`); a player issuing
  `combat.end`, `initiative.roll`, `participant.visibility`, `participant.remove`,
  `health.override`, `turn.jump`; a player acting on another player's character.
- **Malformed payloads** — eight shapes of nonsense and one broken JSON body, none of which
  moves the fight; over-posts refused by name; a write claiming to be library content.
- **Replay** — the same command twice recognised over the wire; a reused command id with a
  *different* intent never applying it.
- **Stale commands** — a version behind and a version from the future, both `409`.
- **Unauthorized subscription** — a stranger, a made-up campaign id, and nobody at all, all
  refused; a member let into their room and only theirs.
- **Concurrency** — two damage commands on one version (`200` and `409`, never both); three
  concurrent draft saves ending as one row; a draft finalised twice becoming one character;
  two content imports racing to the same catalogue.

### Accessibility smoke

Run at 1440×900, 1024×768 and 390×844 over eleven screens. What it checks, definitively: one
first heading per page, an accessible name on every control, a label on every input, an alt on
every image, the keyboard reaching a control, the skip link being the *first* stop in the DM
shell, the landmarks being present, and every player control clearing the 44px floor.

What it does not: colour contrast (the palette is verbatim from the approved design and is that
design's contract), focus order past the first stop, and live-region announcement. Those are
the manual pass, named rather than implied.

No axe, no rule engine. This project takes a dependency when it buys something the platform
does not, and a browser can answer all of the above directly.

### One new dependency, and one new knob

`@playwright/test`, as a devDependency. Browser end-to-end coverage cannot be written without
a browser driver, and this is the one that gives independent contexts, a real accessibility
tree and a CI story. It ships nothing.

`TC_RATE_LIMIT_SCALE` multiplies every rate limit, default 1. The limiter counts an anonymous
caller by address — the only thing it can know about them — so a company behind one NAT, a
university, a conference network and a test suite all look like one very busy person. That is a
real deployment property, and the honest answer is a knob with a safe default rather than a
limit nobody can raise or a limit nobody enforces. It scales the count, never the window.

### Flakiness: six causes, six fixes, no retries

`retries: 0`, in CI too, because a retry count is how a suite stops being able to tell you it
is flaky. Every intermittent failure was diagnosed:

| Symptom | Cause | Fix |
| --- | --- | --- |
| A spec tested the *previous* run's server | An interrupted run orphaned the API; the new one failed to bind and the health check saw the old one | `clearPort()` kills it, or fails naming the port |
| `Failed to fetch dynamically imported module` | A reused preview server served an `index.html` whose content-hashed chunks were gone | Rebuild per run |
| Sign-ups refused with 429 | One address, ten auth requests per window | `TC_RATE_LIMIT_SCALE` |
| `ERR_ADDRESS_IN_USE` and refused connections | The proxy opened a fresh upstream socket per request; two browsers exhausted the ephemeral port range | A keep-alive agent on the proxy — better in development too |
| The same, right after the restart test | Pooled sockets pointing at a process that no longer existed | The restart test waits for the whole path, proxy included |
| Tight polling | Playwright's default retries an expectation ten times a second | Explicit backoff on the polls that make requests |

The fourth is the one worth keeping in mind: **most of what looked like flakiness was the
`/me` loop**, and once that was fixed the suite went from two-minute runs with intermittent
failures to a clean 1.2 minutes.

### Checks run

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | 0 findings |
| `npm run format:check` | clean |
| `npm run test` (with `DATABASE_URL`) | **460 passing**, 0 failing |
| `npm run e2e` | **37 passing**, 0 failing — three consecutive full runs |
| `npm run build` | entry 413.73 kB / 129.52 kB gzip, no size warning |

### Not done, and deliberately so

- **One browser engine.** Chromium. Firefox and WebKit are one line each in the config and
  three times the wall clock; the value is in the two-client behaviour, not in the engine.
- **No CI workflow file.** TC-P09 owns CI, and the suite is written to run in one: no reused
  servers, no shared state between runs, `forbidOnly` under `CI`, and a database it creates
  itself. What it needs from a runner is PostgreSQL, `npx playwright install chromium`, and an
  ephemeral port range larger than its own TIME_WAIT backlog.
- **No visual regression.** Screenshots on failure only. A pixel baseline is a different kind
  of test with a different maintenance cost, and TC-15's fidelity pass is the existing answer.
- **The player's own combat screen is driven less deeply than the DM's.** Rolls and death saves
  are exercised through the API and asserted on both clients; tapping through the roll sheet is
  the largest remaining UI-driving gap.

### Next eligible prompt

**TC-P09** — CI, deployment and observability.

## TC-P09 — CI, deployment and observability

Everything before this could be run by a person who already knew how. This is the part that
lets somebody else deploy it, and lets a machine say whether a commit is safe.

### What the staging validation found

The acceptance criterion is that *a clean staging deployment can run the Golden Path*. Doing it
rather than describing it found a real defect:

**Imported creatures never reached the library.** TC-P06's importer wrote `content_records`;
the application serves creatures from `monsters`. Nothing connected the two, so a fresh
deployment had migrations, 114 imported records, and **an empty creature library** — the
encounter builder answered "No creatures match" and the Golden Path could not proceed. Only
`db:seed` had ever filled that table, and seeding demo data is not something a production
deployment does.

Every TC-P06 test passed throughout: they asserted the content came back through
`loadContent`, which is a different path from the one a screen uses. It took a container, a
clean database and two browsers to see it.

The importer now writes both, `005_content_monsters.sql` makes the source reference cascade so a
source can still be removed, and the content import is step 3 of the documented startup order
and a service in the compose file.

### Continuous integration

`.github/workflows/ci.yml` — four jobs, split by what each needs rather than by taste, so a
lint error is reported in under a minute instead of behind a browser suite.

| Job | |
| --- | --- |
| **check** | `npm ci`, lint, typecheck, format, build, and the secret guardrail |
| **test** | PostgreSQL service; migrations, **migrations again** (idempotence), `--check`, the suite, then the suite *without* a database to prove it skips rather than fails |
| **e2e** | Chromium cached by lockfile hash; the 37-test suite; traces uploaded on failure |
| **image** | Builds the image, migrates with it, runs it, asks `/health`, `/ready` and `/metrics`, checks the bundle is served and `/api/me` is 401, sends SIGTERM and asserts the drain happened and the exit code is 0, and greps the container's log for credentials |

`npm ci` everywhere: a run cannot pick up a version nobody chose.

**`check:package` is deliberately not in CI.** `tools/validate-package.mjs` validates the
delivery package — the prompt files and a `PROJECT_STATUS.md` with every box unticked. Every
completed prompt makes it fail by design, so running it here would mean a red build on every
commit for a reason that is not a defect, which is how a CI signal stops meaning anything. It
stays available as `npm run check:package`.

### Four environments, and what separates them

`TC_ENV` — `development` · `test` · `staging` · `production` — separate from `NODE_ENV`, which
the toolchain owns and which only really has two values. They differ in what they are *allowed*
to do:

| | Cookies | Binds | Migrations |
| --- | --- | --- | --- |
| development / test | not `Secure` | loopback | on boot |
| staging / production | `Secure` | every interface | a deploy step |

Unset means **development**: nothing gains a permission by being unlabelled, and a deployment
that forgets the variable gets the strictest cookie policy it can have over http rather than the
loosest. `NODE_ENV=production` still means production, so nothing that predates this breaks.

Staging is production-shaped on purpose. A staging deployment that only works because its
cookies are laxer has proved nothing.

### One image, one process, one origin

A multi-stage `Dockerfile`: build with the full toolchain, then a runtime layer with production
dependencies, a non-root user, and a `HEALTHCHECK`. The server is PID 1, so `SIGTERM` reaches it
and the drain runs — a shell wrapper would swallow the signal and turn every deploy into a hard
kill.

**The same process serves the bundle and the API.** `TC_STATIC_DIR` set means `/` is the
application and `/api/*` is the API, which is the same split the development proxy makes. That
is what keeps the topology same-origin — the reason the session cookie can be `SameSite=Strict`
— with no proxy to configure and one thing to roll back.

`server/static.ts` is small and gets one thing right emphatically: a request is data, and a
request that walks out of the directory is how a static handler becomes a way to read
`/etc/passwd`. Four escape attempts are tested, including percent-encoded and a null byte, plus
the sibling-prefix case (`/srv/app-secrets` for a root of `/srv/app`) that a naïve `startsWith`
would allow.

### Liveness and readiness are different questions

| | Answers | A 503 means |
| --- | --- | --- |
| `/health` | Is this process running and able to reach its database | **Restart me** |
| `/ready` | And can it serve — schema current, not draining | **Stop sending traffic**; restarting will not help |

The case that separates them is a schema behind the code, and it is tested: delete a
`schema_migrations` row and `/ready` turns 503 naming the count while `/health` stays 200.

That distinction is also what makes a deploy quiet. The drain, in order: `/ready` starts
refusing *first*, so the balancer stops sending work before anything is torn down; the listener
closes; idle keep-alives close; after the grace period the long-lived event streams are closed
and the clients reconnect, which TC-P08 already proved they do; the pool closes last.

### Metrics without a vendor

`GET /metrics`, Prometheus text, hand-written — a line-based format does not need a client
library. **Labels are bounded on purpose**: a metric labelled with a request id or a resolved
path is unbounded cardinality, which is a memory leak here and a bill wherever it is stored. The
router already knows the route *pattern*, which is a small closed set, and so is a status class.

Requests by route/method/status-class, a duration histogram, refusals by contract error code,
and open event streams. Counts, never content.

### The redaction rule is now executed

`server/log.ts` stated what a log line may never contain. It now **enforces** it: `redact()`
runs on every line from every caller, refusing a field whose *name* looks like a credential
(`password`, `token`, `cookie`, `email`, `inviteCode`, `body`, `stack`, …) and a *value* that
looks like one whatever it is called (`scrypt$…`, `tc_session=…`, `Bearer …`).

A rule that lives only in a comment is one hurried commit from being untrue. CI also greps the
running container's log for the database password, a hash prefix and a session cookie.

### Production-safe limits

`headersTimeout` 20s, `requestTimeout` 60s, `keepAliveTimeout` 65s. Node's defaults are 60s and
*no limit*; a request that never finishes holds a socket, and enough of them is an outage that
looks like nothing. The keep-alive is deliberately longer than a typical balancer's idle timeout
so this process is not the one closing a connection the balancer is about to reuse — that race
shows up as sporadic 502s nothing in the application can explain.

`TC_SHUTDOWN_GRACE_MS` is validated at startup, as is `TC_RATE_LIMIT_SCALE`, which cannot be set
below 1: it exists to fit the limits to a topology, not to turn them off.

### Migrations, backup and rollback

`npm run db:migrate -- --check` applies nothing and exits non-zero when the schema is behind —
a question with an exit code, which is what a release gate and a CI job both want.

`DEPLOYMENT.md` writes down what was previously only true: additive-by-policy migrations, the
two-deploy dance for a genuine removal, `pg_dump --format=custom` before any migrating release,
a restore that is only real once it has been done, and rollback by image tag. **The schema does
not roll back** — there are no `down` migrations, deliberately, because a generated `down` is a
script nobody has run against real data and running one during an incident is how a bad deploy
becomes a lost database. Additive migrations are what make rolling only the application back
sufficient.

### Validating a deployment

```bash
TC_E2E_BASE_URL=https://staging.example.test npm run e2e
```

The suite builds no world and resets nothing — against a deployment it never reaches the code
that would drop a database. Two tests skip themselves **by name**: the backend restart and the
recovery after it, because this suite does not restart a server it did not start. Saying which
coverage is missing beats appearing complete.

Run against a clean staging container built from the `Dockerfile`, migrated and imported through
it: **35 passed, 2 skipped, 0 failed.**

Two things it needs, both documented: `TC_RATE_LIMIT_SCALE` raised on the target (nine sign-ups
from one address in a minute is exactly what the auth limit exists to stop), and the content
import to have run.

### Checks run

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | 0 findings |
| `npm run format:check` | clean |
| `npm run test` (with `DATABASE_URL`) | **481 passing**, 0 failing |
| `npm run e2e` (local stack) | 37 passing |
| `npm run e2e` (against the staging container) | **35 passing, 2 skipped** |
| `npm run build` | 413.73 kB / 129.52 kB gzip |
| `npm run check:secrets` | passed |
| `npm run db:migrate -- --check` | exits 0 when current, 1 when behind |
| `docker build` → migrate → import → run | `/health` ok, `/ready` ready, `/metrics` served, bundle served, `/api/me` 401 |

21 new tests in `server/operations.test.ts`.

### Not done, and deliberately so

- **One instance.** The rate limiter and the realtime hub are both per-process, so a second
  instance means a DM on A and a player on B never see each other's events. The fix is a shared
  bus and PostgreSQL `LISTEN`/`NOTIFY` is already in the box; it is named in `DEPLOYMENT.md` as
  the thing to build before running a second instance rather than built speculatively before
  there is one. Sticky sessions are not a substitute — a DM and a player are different browsers.
- **No point-in-time recovery.** Nightly dumps are documented; continuous archiving is a managed
  PostgreSQL feature and a platform choice rather than an application one.
- **No error-reporting vendor.** The boundary exists — every unhandled rejection and uncaught
  exception is one structured line and then a drain — and no provider is wired in, because none
  has been approved and a provider-neutral boundary is what the prompt asked for.
- **No deploy job in CI.** CI validates; it does not push. There is no approved provider and no
  registry, and a workflow that deploys nowhere is a workflow that looks like it does.
- **`npm audit` is not a gate.** Two runtime dependencies and no lockfile churn; a scheduled
  advisory check belongs with dependency automation, not on the path of every commit.

### Next eligible prompt

**TC-P10** — the production Golden Path sign-off, which this slice has already exercised end to
end against a container.

## TC-P10 — Production readiness audit

Everything below was **run**, on 2026-08-17, against a container built from this commit's
`Dockerfile`, a PostgreSQL database created empty for the purpose, and two independent browsers.
Nothing here is quoted from an earlier slice's report.

---

# RELEASE DECISION: **READY WITH NON-BLOCKING FOLLOW-UPS**

The Golden Path passes end to end against the production-shaped stack with two independent
clients, real persistence, real authorization and real realtime. No blocker was found. Four
follow-ups are recorded below, each with an owner action; none of them touches the four things
that would have forced BLOCKED — fixtures, client-only authorization, non-durable state, or a
single-client realtime simulation.

---

## What was verified, and how

### The stack under test

```
docker build -t table-companion:tc-p10 .
docker run --rm  … node server/migrate.ts        → Applied 5 migration(s)
docker run --rm  … node server/content/import.ts → 66 + 48 records
docker run -d -p 8791:8787 -e TC_ENV=production …
GET /ready → {"status":"ready","detail":"schema up to date"}
```

An empty database (`table_companion_p10`, dropped and created for this run), migrated and
imported *through the image*, then served by it. `TC_COOKIE_SECURE=false` is the one deviation
and is discussed under **F-1**.

### The Golden Path, two independent browsers

`TC_E2E_BASE_URL=http://127.0.0.1:8791 npx playwright test` → **35 passed, 2 skipped, 0 failed.**

Separate `BrowserContext`s — separate cookie jars, separate storage — a DM at 1440×900 and a
player at 390×844. Every step the prompt names:

| Step | Evidence |
| --- | --- |
| Account / session | `/signup` in each browser; HttpOnly cookie asserted; `/me` answers with the right identity |
| Campaign creation | Created through the UI; invite code read back from the API and found on screen |
| Invite / join | Redeemed **in the second browser**; membership read back as `player`, never `dm` |
| Character creation | Driven through every step of the guided builder; read back owned by that account, in that campaign |
| Encounter creation | Party present, creature added from the imported library, autosave confirmed on screen and on the server |
| Combat start | Server-rolled initiative, `combat.begin`, status `live`, round 1 |
| Initiative / turns | `turn.next`; both clients agree on the active participant and round |
| Player roll / action | Rolls recorded and served per viewer |
| Damage / heal / conditions | Applied by the DM, observed by the player **without a reload** |
| Secret / private | Four places — see below |
| Disconnect / reconnect | Context offline, fight moves on, back online, client converges on the server's version |
| Refresh | Same version, same active participant, same round |
| Server restart | Verified separately — see below |
| Combat completion | `combat.end`; both clients see it |

The two skipped tests are the backend restart and the recovery after it, skipped **by name**
because the suite does not restart a server it did not start. They are covered directly instead.

### Server restart recovery

Restart performed against the running container mid-fight:

```
pre-restart   {"version":4,"round":1,"activeParticipantId":"p-7e8d…","health":[9]}
docker restart tc-p10
              server.draining {signal:SIGTERM, graceMs:15000}
              server.stopped  {reason:closed}
              server.listening
post-restart  {"version":4,"round":1,"activeParticipantId":"p-7e8d…","health":[9],"status":"live"}
rolls         {"count":1}
```

Identical version, round, active participant and hit points. **No silent loss and no
duplication** — the roll recorded before the restart is there once, not twice. The session
survived too: a sign-in issued before the restart was still valid after it, because a session is
a row rather than a memory map. The drain was graceful, in order, exit code 0.

### Stale and concurrent mutations

Against the same container:

- Two `health.damage` commands built on **one version**, issued together → `200` and `409`.
  Never both. The fight moved by exactly one version (3 → 4).
- A command built on an older version → `409` with `code: "conflict"`, which is what the client
  branches on.

Nothing silently overwrote newer authoritative state.

### Secret and private data — four places

| Where | Result |
| --- | --- |
| **API responses** | A secret roll is in the DM's `/combats/:id/rolls` and **absent** from the player's. A `dm-only` creature is absent from the player's combat payload — not marked in it |
| **Realtime** | The player's stream is never told about either; the events chose a `dm` audience |
| **DOM** | Neither name appears in `page.content()` after a reload — including anything CSS might be hiding |
| **Logs** | 617 lines from the production container: **0** occurrences of the database password, `scrypt$`, `tc_session=`, the test password, the secret roll's title, or any `@example.test` address |
| **Diagnostics** | `/metrics`, 74 lines: **0** occurrences of a campaign, combat, character or account id |

And an outsider account, signed up for the purpose, could not read the fight by id (`null`) or
command it (`403`). The DM saw everything the player did not, or none of the above would prove
anything.

### Logs carry patterns, not paths

12 distinct route values in the container's log, every one of them a pattern —
`/combats/:combatId/commands`, `/campaigns/:campaignId/characters`. **0** log lines carry a
resolved id.

---

## Two defects found and fixed during the audit

**D-1 — Staging cookies were laxer than the document promised.**
`DEPLOYMENT.md` stated staging gets production-shaped cookies; `main.ts` still keyed the flag
off `config.isProduction`, so a staging deployment's session cookie was not `Secure`. A staging
run that only passes because its cookies are laxer proves less than it appears to.
Fixed: `config.secureCookies` follows the environment, `main.ts` uses it, and `TC_COOKIE_SECURE`
is an explicit documented exception that logs a warning when it is off in staging or production.
Two regression tests.

**D-2 — `TC_MIGRATE_ON_BOOT` defaulted to *on* under `TC_ENV=production`.**
Safe only because the image sets it explicitly. A deployment built any other way would have had
every instance racing for the schema as it booted — the exact thing TC-P09's startup order
exists to prevent. Fixed: the default now follows the environment (on for development and test,
off for staging and production), still overridable, with a typo refused rather than silently
taken. Regression test.

Both were found by *doing* the deployment rather than reading it.

---

## Non-blocking follow-ups

**F-1 — `Secure` cookies were not exercised by a browser.**
The audit ran over `http://127.0.0.1`, so the run used `TC_COOKIE_SECURE=false`; a browser will
not store a `Secure` cookie over plain http. That the flag is set correctly in staging and
production is proved by unit test, not by a browser.
*Owner action:* run the suite once against a TLS-terminated staging host before the first real
release — `TC_E2E_BASE_URL=https://…`, no override. Everything else in this audit already
passed against `TC_ENV=production`.

**F-2 — A free-form attack roll is still evaluated on the client.**
Checklist item 21, open since TC-P04 and stated in every report since. A player may issue
`health.damage` against a *creature* with an amount their client chose — which is deliberate
(attacking a monster is the whole player screen) and bounded: they cannot touch another
player's character, cannot roll somebody's death save, and cannot issue a DM command. It is a
cheating vector between people who chose to play together, not a privilege escalation or a data
leak.
*Owner action:* close it by having the ruleset resolve an action end to end server-side. Sizeable
and squarely Phase 2.

**F-3 — Fixture demo data ships in the production bundle.**
~30 kB of source in `src/domain/data/fixtures.ts` survives into the entry chunk even though the
fixture repository is only selected when `VITE_API_BASE_URL` is empty. It is invented content —
no real data, no credentials — and unreachable in the shipped configuration, because the image
sets that variable. The sharper edge is the footgun: **a production build made outside the
Dockerfile with the variable unset would silently run on fixtures.**
*Owner action:* make `createDataSource` fail loudly rather than fall back when the build is a
production build, and let the bundle shed the fixtures with it.

**F-4 — `/dev/showcase` is routed in production.**
It answers 200 on the deployed container. It is the design-fidelity surface, linked from
nothing, and renders only design primitives with invented content — no data, no API calls. It is
surface area that does not need to exist in a deployment.
*Owner action:* exclude the route from a production build, or accept it deliberately and say so
in `DEPLOYMENT.md`.

---

## Configuration and dependency audit

| Checked | Finding |
| --- | --- |
| Runtime dependencies | Four: `pg`, `react`, `react-dom`, `react-router-dom`. `npm audit`: **0 vulnerabilities**, production and dev |
| Production defaults | `secure: true`, `SameSite=Strict`, `crossOrigin: false`, `trustProxy: false`, `rateLimitScale: 1`, `host: 0.0.0.0` — every one of them the safe value |
| Debug leftovers | No `console.log`, `debugger`, `TODO`, `FIXME`, `XXX` or `HACK` in shipped `src/` or `server/` |
| Real secrets | `npm run check:secrets` passes: no env files, keys, hashes, tokens or unexpected connection-string passwords tracked |
| Dev identity shims | `TC_DEV_USER_ID` is *refused at startup*, and `CURRENT_USER_ID` is not exported from the domain barrel |
| Client-only authorization | `permissions.ts` is a UI guard; the server runs the same module before serialising, and `authorize.ts` is the only `Repositories` a handler is given |
| Fixture fallback | Reachable only with `VITE_API_BASE_URL` unset — see **F-3** |

---

## Deployment procedure, verified

| | |
| --- | --- |
| Image builds | Yes, multi-stage, non-root, server as PID 1 |
| Migrations | 5 applied through the image; `--check` exits 0 when current, 1 when behind; applying twice is a no-op |
| Content import | Ran through the image; the library serves 48 creatures the encounter builder actually found |
| Health / readiness | `/health` 200; `/ready` 200 with detail; readiness turns 503 on a pending migration while health stays 200 |
| Metrics | 74 lines of Prometheus text, bounded labels, no identifiers |
| Graceful shutdown | `docker restart` → drain logged in order, exit code 0, nothing lost |
| Backup / restore | Documented in `DEPLOYMENT.md` with commands and expectations. **Not exercised in this audit** — the procedure is written, a restore has not been performed |
| Rollback | Documented: by image tag; no `down` migrations, deliberately, with the two-deploy dance for a genuine removal |

---

## The full suite, this commit

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | 0 findings |
| `npm run format:check` | clean |
| `npm run test` (no database) | 483 tests, 358 pass, **0 fail**, 125 skipped |
| `npm run test` (with database) | **483 pass, 0 fail** |
| `npm run e2e` (local stack) | **37 pass, 0 fail** |
| `npm run e2e` (production container) | **35 pass, 2 skipped by name, 0 fail** |
| `npm run build` | entry 413.73 kB / 129.52 kB gzip, no size warning |
| `npm run db:migrate -- --check` | Schema is up to date |
| `npm run check:secrets` | passed |
| `npm audit` | 0 vulnerabilities |

`npm run check:package` is not part of this: it validates the delivery package, whose
`PROJECT_STATUS.md` must have every box unticked, so a completed sequence fails it by design.

---

## What this release is not

Stated so nobody has to discover it:

- **One server instance.** The rate limiter and the realtime hub are per-process. Two instances
  means a DM on one and a player on the other never see each other's events. `DEPLOYMENT.md`
  names the fix — a shared bus over PostgreSQL `LISTEN`/`NOTIFY` — and why it is not built
  before there is a second instance to need it.
- **One browser engine tested.** Chromium.
- **No point-in-time recovery**, no error-reporting vendor, no deploy automation. Each is a
  platform choice with an approved provider still outstanding, and each has a boundary rather
  than a stub.
- **Phase 1 scope.** No spells or items screens, no password or email change, no account
  deletion, no per-member presence, no offline queue. All are named in `README.md`.

### Next eligible prompt

None — the production sequence is complete. The four follow-ups above are the backlog.
