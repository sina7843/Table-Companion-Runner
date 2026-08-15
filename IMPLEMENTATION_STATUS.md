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
