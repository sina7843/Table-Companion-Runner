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
