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
