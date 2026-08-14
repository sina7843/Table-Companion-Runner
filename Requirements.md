# Table Companion — Product Requirements

## Document Status

- **Product:** Table Companion
- **Document Type:** Product Requirements
- **Current Focus:** Phase 1
- **Future Roadmap:** Phase 2 and Phase 3
- **Primary Initial Game System:** Dungeons & Dragons 5e / 5.5e (2024)
- **Architecture Goal:** Game-system agnostic and extensible to additional tabletop RPG systems such as Pathfinder
- **Primary Initial Audience:** Experienced Dungeon Masters
- **Primary DM Devices:** Desktop and Tablet
- **Primary Player Device:** Mobile
- **Product Mode:** Supports both in-person tabletop play and online play

---

# 1. Product Vision

Table Companion is intended to become an integrated operating system for tabletop role-playing campaigns.

The product should unify:

1. Character creation and character management
2. Monster creation and monster management
3. Encounter preparation
4. Live combat management
5. Campaign knowledge management
6. Linked lore, NPCs, notes, locations, quests, and factions
7. A complete virtual tabletop

Long-term positioning:

> **Table Companion = The operating system for your tabletop campaign.**

The product should eventually combine the strengths of:

- Character Sheet tools
- Combat Managers
- Campaign Wikis / Knowledge Bases
- Virtual Tabletops

while keeping all of these systems connected through shared entities rather than isolated modules.

---

# 2. Product Strategy

The product roadmap is divided into three major phases.

## Phase 1 — Core Play Engine

Primary goal:

> Enable Dungeon Masters and Players to create and manage characters, monsters, encounters, and live combat efficiently.

Main pillars:

- Character Experience
- DM Workspace
- Combat Engine

Hero use case for the Dungeon Master:

> Start a prepared encounter and manage the entire combat/session from one workspace without jumping between multiple tools.

Character Builder acts as an acquisition experience for Players.

Character Sheets and Monster Sheets act as the foundation of the product.

Combat / Session Control is the primary hero experience for experienced Dungeon Masters.

---

## Phase 2 — Campaign Brain

Primary goal:

> Turn Table Companion into the persistent memory and knowledge workspace of a campaign.

Key capabilities:

- Lore
- NPCs
- Locations
- Quests
- Factions
- Notes
- Entity linking
- Player personal notes
- Campaign knowledge graph

All major campaign entities should be linkable to one another.

Example:

`NPC → Faction → Location → Quest → Player → Session`

The experience should support linking similar to Notion or Obsidian.

Example syntax / interaction:

- `@NPC Name`
- `[[Location Name]]`

The exact syntax is implementation-dependent, but users must be able to create semantic links between entities directly from content.

---

## Phase 3 — Full Virtual Tabletop

Primary goal:

> Provide a complete professional VTT that can both replace products such as Roll20 / Foundry and complement physical tabletop sessions.

Planned capabilities include:

- Battle Maps
- Grid
- Tokens
- Fog of War
- Dynamic Lighting
- Measurement
- Movement
- Area-of-Effect Templates
- Initiative on Map
- Character / Monster Token Synchronization
- Dice Rolling
- Combat Automation
- Map Assets
- Encounter ↔ Map connection
- Realtime Multiplayer

Long-term interaction model:

`Token → Entity → Sheet → HP → Conditions → Initiative → Actions`

A token must represent the same underlying entity used elsewhere in the product, rather than becoming a duplicate data object.

---

# 3. Core Product Principles

## 3.1 Game-System Agnostic Architecture

The core platform must not be tightly coupled to D&D rules.

D&D 5e / 5.5e is the first supported ruleset and the initial testing environment.

The architecture must allow additional game systems to be added later without rebuilding the main product.

Potential future systems include:

- Pathfinder
- Other tabletop RPG systems

The following concepts must not be hard-coded specifically to D&D inside the core platform:

- Ability calculations
- Armor Class
- Initiative formula
- Death Saves
- Spell Slots
- Level progression
- Proficiency
- Character creation rules
- Action economy
- Conditions
- Dice formulas
- Advancement rules

These must be supplied or interpreted by a **Rules Engine / Ruleset layer**.

---

## 3.2 Entity-Based Architecture

Major product objects should be treated as reusable entities.

Initial core entities include:

- User
- Game System
- Ruleset
- Campaign
- Character
- Monster
- Encounter
- Combat Instance
- Roll
- Condition

Future entities include:

- NPC
- Lore Entry
- Location
- Quest
- Faction
- Note
- Map
- Token

Entities should remain reusable and linkable instead of existing as isolated page-specific data.

---

## 3.3 Rules-Valid by Default, Override When Needed

The system should enforce and guide users toward rules-valid configurations by default.

However, experienced Dungeon Masters must retain control.

Required principle:

> **Rules-valid by default + Manual Override**

Where possible:

- System performs automatic calculations.
- System warns about invalid states.
- System provides sensible defaults.
- DM can manually override values when necessary.

---

## 3.4 Automation First

Any value that can be calculated reliably from rules and character state should be calculated automatically.

Examples include:

- Ability modifiers
- Proficiency bonus
- Skill modifiers
- Saving throw modifiers
- Armor Class where deterministic
- Spell attack bonus
- Spell save DC
- Initiative modifier
- Derived HP values
- Level-based values
- Spell slot progression
- Relevant attack modifiers

Manual input should be reserved for cases where automation is impossible, ambiguous, or intentionally overridden.

---

# 4. User Roles

## 4.1 Dungeon Master

Phase 1 allows one primary Dungeon Master per Campaign.

The DM has:

- Full Campaign management permissions
- Full Character Sheet viewing permissions
- Full Character Sheet editing permissions
- Full Monster management permissions
- Full Encounter management permissions
- Full Combat control
- Manual override capability
- Access to private Character Sheet sections
- Ability to make secret dice rolls
- Ability to edit or undo combat changes

Co-DM is intentionally excluded from Phase 1.

Co-DM support is planned for a later phase.

---

## 4.2 Player

A Player can:

- Create independent Characters
- Join Campaigns
- Attach a Character to a Campaign
- Create Characters through a guided builder
- View and edit owned Character Sheets
- Level up through a guided flow
- View other Party Character Sheets
- Mark supported Character Sheet sections as private from other Players
- Participate directly in live Combat
- Manage their own turn
- Roll attacks, actions, spells, and damage from their Character Sheet
- Maintain personal Notes in Phase 2

---

# 5. Device Strategy

## Dungeon Master

Primary target devices:

- Desktop
- Tablet

The DM experience should prioritize:

- Information density
- Rapid scanning
- Multi-entity control
- Efficient encounter management
- Minimal page switching

---

## Player

Primary target device:

- Mobile

The Player experience should prioritize:

- Fast access to Character information
- Simple guided flows
- Large touch targets
- Easy turn management
- Quick action and spell access
- Minimal cognitive load during combat

Responsive web support is expected.

---

# 6. Phase 1 Scope

Phase 1 must provide a complete usable product, not merely infrastructure for future phases.

Phase 1 contains:

- Authentication / Users
- Game System selection
- Campaigns
- Party management
- Character creation
- Character management
- Character level-up
- Character Sheets
- Character privacy controls
- Monster library
- Monster Sheets
- Custom / Homebrew Monsters
- Monster cloning
- Monster editing
- Encounter builder
- Saved Encounters
- Reusable Encounters
- Live Combat
- Realtime multiplayer state
- Initiative management
- Round management
- Turn management
- HP management
- Damage
- Healing
- Conditions
- Death Saves where ruleset supports them
- Dice rolling
- Rolls from Character actions
- Rolls from Monster actions
- Public rolls
- Secret DM rolls
- Combat log
- DM edit / override / undo
- Data sourced from 5e.tools for D&D
- Autosave
- Graceful reconnect and state recovery

---

# 7. Campaign Requirements

## 7.1 Campaign Creation

The DM must be able to create a Campaign.

A Campaign should include at minimum:

- Name
- Game System
- Ruleset / Version
- DM
- Party
- Encounters
- Combat History
- Campaign Settings

---

## 7.2 Campaign Membership

Players must be able to join a Campaign.

The joining mechanism may be:

- Invite link
- Invite code

Exact implementation is flexible.

---

## 7.3 Character Independence

A Character must be able to exist independently from any Campaign.

A Player can:

1. Create an independent Character
2. Later attach that Character to a Campaign

Campaign membership must not be required for basic Character creation.

---

## 7.4 DM Count

Phase 1:

- Exactly one primary DM per Campaign

Future:

- Co-DM support

---

# 8. Character Requirements

## 8.1 Character Creation

Character creation must use a guided step-by-step builder.

The experience must be accessible to new Players while still supporting experienced users.

Initial D&D flow should include appropriate steps such as:

1. Game System / Ruleset
2. Species / Race
3. Background
4. Class
5. Ability Scores
6. Proficiencies
7. Equipment
8. Spells
9. Character Details
10. Review
11. Create Character

The exact order may vary based on the ruleset.

---

## 8.2 Rules-Aware Builder

The builder must:

- Understand rules dependencies
- Filter valid choices where possible
- Explain required selections
- Calculate derived values automatically
- Surface conflicts and requirements
- Prevent accidental invalid builds by default
- Allow manual override where permitted

---

## 8.3 Character Level Up

Level Up must be a guided step-by-step workflow similar in simplicity to modern VTT character advancement systems.

The Player should not be required to manually discover all consequences of leveling.

Possible D&D steps include:

1. New Level
2. New Class / Subclass features
3. HP changes
4. Proficiency updates
5. Spell changes
6. New choices
7. Ability Score / Feat choices if applicable
8. Review Changes
9. Confirm Level Up

The Rules Engine must determine which steps are necessary.

---

## 8.4 Character Sheet

Character Sheet should support at least:

- Character overview
- Core stats
- Abilities
- Skills
- Saving Throws
- Armor Class
- HP
- Conditions
- Combat values
- Attacks
- Actions
- Spells
- Inventory
- Features
- Background
- Notes / related sections where appropriate
- Privacy settings

Suggested information architecture:

- Overview
- Abilities
- Skills & Saves
- Combat
- Spells
- Inventory
- Features
- Background
- Notes
- Settings / Privacy

---

## 8.5 Character Editing

The Character owner can edit their Character.

The DM can fully edit Characters that belong to the Campaign.

DM edit permission is not limited to specific sections.

---

## 8.6 Character Privacy

Players can view other Party members' Character Sheets.

However, a Player must be able to mark supported sections as private from other Players.

Required visibility model:

- DM: Full access
- Character Owner: Full access
- Other Party Members: Public sections only

Private Character Sheet sections remain visible to the DM.

This is distinct from Player Personal Notes in Phase 2.

---

# 9. Phase 2 Personal Notes Privacy

Player Personal Notes must be truly private.

Required rule:

> The DM must not be able to read a Player's Personal Notes.

This should be enforced as an actual data access permission, not merely hidden in the interface.

---

# 10. Monster Requirements

## 10.1 Monster Library

The DM must have access to a searchable Monster library.

For D&D, source data should be imported from 5e.tools.

---

## 10.2 Monster Sheet

The DM must be able to:

- View Monster details
- View stats
- View HP
- View AC
- View actions
- View attacks
- View abilities
- View conditions / state
- Roll directly from Monster actions

---

## 10.3 Custom / Homebrew Monster

Phase 1 must support Monster Homebrew.

The DM must be able to:

- Create a Monster from scratch
- Clone an existing Monster
- Edit a cloned Monster
- Edit Monster stats
- Edit actions
- Edit relevant combat properties

---

## 10.4 Homebrew Exclusions

The following Homebrew content types are intentionally excluded from Phase 1:

- Class
- Subclass
- Race / Species
- Background
- Spell
- Item
- Feat

These may be added in later phases.

---

# 11. Encounter Requirements

## 11.1 Encounter as a Persistent Entity

Encounter must exist independently from a live Combat.

An Encounter is a reusable prepared configuration.

Example:

**Goblin Ambush**

- Goblin ×4
- Bugbear ×1

The DM must be able to save this Encounter and start it later.

---

## 11.2 Encounter Builder

The DM must be able to:

- Create Encounter
- Name Encounter
- Add Monsters
- Set Monster quantity
- Add Characters where needed
- Add NPCs when supported
- Configure initial state
- Save Encounter
- Edit Encounter
- Duplicate / reuse Encounter
- Start Combat from Encounter

---

## 11.3 Encounter vs Combat Instance

Starting an Encounter must create a separate Combat Instance.

Changes during Combat must not overwrite the reusable Encounter template.

Required model:

`Encounter Template → Start → Combat Instance`

---

# 12. Live Combat Requirements

Live Combat is the hero experience of Phase 1.

The Combat interface should behave as a **Command Center**, not simply as a Character Sheet placed next to an initiative table.

The DM should be able to manage most combat tasks without navigating away.

---

## 12.1 Combat Participants

A Combat may contain:

- Player Characters
- Monsters
- Future NPC entities

---

## 12.2 Initiative

The system must support:

- Initiative rolls
- Automatic initiative modifiers
- Initiative ordering
- Manual DM adjustment
- Reordering when necessary

Rules are defined by the selected Ruleset.

---

## 12.3 Round Management

The system must track:

- Current Round
- Current Turn
- Next Turn
- Previous Turn where useful

---

## 12.4 Player Turn Control

Players actively participate in Combat.

A Player must be able to manage their own Turn.

Player actions should update the Combat state in realtime.

---

## 12.5 DM Control

The DM has ultimate control.

The DM can:

- Edit values
- Override values
- Correct mistakes
- Undo supported actions
- Change HP
- Apply / remove Conditions
- Adjust initiative
- Advance turns
- Resolve incorrect state

---

## 12.6 Damage

Damage is applied directly.

Required flow:

`Player Action → Roll → Damage Roll → Apply Damage → Target HP updates`

DM approval is not required before applying damage.

The DM can edit or undo the result afterward.

---

## 12.7 Healing

Healing must update the relevant target's HP directly.

The DM can edit or override healing results.

---

## 12.8 HP

Combat must support:

- Current HP
- Maximum HP
- Damage
- Healing

Ruleset-specific HP behavior should be supported through the rules layer.

---

## 12.9 Conditions

Combat must support Conditions.

Conditions must be:

- Visible in Combat
- Linked to participants
- Addable
- Removable
- Realtime synced

Ruleset determines available standard Conditions.

---

## 12.10 Death Saves

For D&D rulesets, Death Saves must be supported.

Death Saves should be treated as a Ruleset feature rather than a universal core rule.

The system should support:

- Success tracking
- Failure tracking
- Relevant resets
- Realtime visibility
- DM override

---

# 13. Dice Requirements

## 13.1 Internal Dice Roller

Phase 1 must include a built-in dice roller.

Dice rolling must not be limited to manual expressions.

Users should be able to roll directly from:

- Character attacks
- Character actions
- Character spells
- Monster attacks
- Monster actions
- Relevant Sheet fields

---

## 13.2 Rules-Aware Rolls

The system should calculate appropriate modifiers automatically.

Example:

`Longsword +6`

Selecting the action should execute the relevant roll using current Character state and Ruleset rules.

---

## 13.3 Public and Secret Rolls

The DM decides whether a DM roll is:

- Public
- Secret / Private

Secret rolls must not expose their result to Players.

---

# 14. Realtime Requirements

Phase 1 must support realtime multiplayer state synchronization.

Examples:

- Player HP change appears for DM
- DM Condition change appears for Player
- Turn changes appear for all participants
- Damage is reflected immediately
- Death Saves update immediately
- Rolls appear immediately according to visibility rules

---

# 15. Offline and Connectivity Strategy

Phase 1 should be **Online-first**, not Offline-first.

Reason:

True offline multiplayer synchronization would significantly increase complexity through:

- Conflict resolution
- State reconciliation
- Offline combat branching
- Multi-user merge logic

For Phase 1, simplicity is more important.

Required Phase 1 reliability behavior:

- Autosave
- Graceful reconnect
- Recovery from last valid server state
- Clear connectivity state where needed
- Minimize loss of active Combat state

Full offline-first operation may be considered in a future phase.

---

# 16. Combat Log

Phase 1 must maintain a Combat Log.

Examples of logged events:

- Round started
- Turn started
- Attack rolled
- Spell cast
- Damage applied
- Healing applied
- Condition added
- Condition removed
- Death Save rolled
- Participant defeated
- DM override
- Undo / correction

Example:

`Round 2 → Aria cast Fireball → Goblin #2 took 19 damage → HP 0`

The log should support enough history to understand what occurred during the Combat.

---

# 17. Combat Workspace UX Requirements

The DM Combat Workspace should prioritize fast scanning.

At minimum, the DM should be able to quickly see relevant values such as:

- Current Turn
- Initiative
- HP
- AC
- Conditions
- Concentration where applicable
- Death Saves where applicable
- Actions
- Recent Rolls

Detailed Character or Monster information should ideally open in:

- Side panel
- Drawer
- Modal panel

rather than forcing the DM to leave the Combat screen.

Primary UX principle:

> Keep the DM inside the Combat Workspace.

---

# 18. Information Architecture — Phase 1

## 18.1 Dungeon Master

Suggested top-level navigation:

- Home
- Campaigns
- Characters
- Monsters
- Encounters
- Active Combat

---

## 18.2 Campaign

Suggested Campaign navigation:

- Campaign Overview
- Party
- Encounters
- Recent Combats
- Campaign Settings

Future Phase 2 additions:

- Lore
- NPCs
- Locations
- Quests
- Notes
- Factions

---

## 18.3 Player

Suggested top-level navigation:

- Home
- My Characters
- Campaigns
- Active Combat

---

# 19. Primary User Flows

## 19.1 Character Creation

`Create Character`
→ Select Game System
→ Guided Builder
→ Rules-driven choices
→ Automatic calculations
→ Review
→ Create Character

---

## 19.2 Character Level Up

`Character`
→ Level Up
→ Rules Engine determines required steps
→ Player makes selections
→ Automatic recalculation
→ Review changes
→ Confirm

---

## 19.3 Create Campaign

`Create Campaign`
→ Select Game System / Ruleset
→ Configure Campaign
→ Invite Players
→ Players attach / create Characters

---

## 19.4 Prepare Encounter

`Create Encounter`
→ Add Monsters
→ Configure quantity
→ Add Characters / participants if necessary
→ Configure initial state
→ Save

---

## 19.5 Start Combat

`Saved Encounter`
→ Start Combat
→ Create Combat Instance
→ Roll / set Initiative
→ Begin Round 1

---

## 19.6 Player Combat Flow

`Active Combat`
→ Player Turn
→ Select Action / Attack / Spell
→ Roll
→ View Result
→ Roll Damage if applicable
→ Apply effect
→ Combat State updates
→ End Turn

---

## 19.7 DM Combat Flow

`Active Combat`
→ Monitor participants
→ View current Turn
→ Apply / edit conditions
→ Edit HP when needed
→ Make public / secret rolls
→ Override or undo results
→ Advance turns
→ End Combat

---

# 20. Phase 2 Requirements

Phase 2 adds Campaign Knowledge Management.

Required content types include:

- Lore
- NPC
- Location
- Quest
- Faction
- Note
- Event where useful

---

## 20.1 Linked Entities

All supported Phase 2 pages should be linkable.

Examples:

- NPC linked to Location
- NPC linked to Faction
- Quest linked to NPC
- Character linked to NPC
- Lore linked to Location
- Notes linked to any supported entity

The product should form a navigable Campaign knowledge graph.

---

## 20.2 Inline Linking

Users should be able to reference entities while writing content.

The interaction should resemble systems such as Notion or Obsidian.

Implementation may use:

- `@Entity`
- `[[Entity]]`
- Autocomplete mentions
- Link insertion UI

Exact syntax is not fixed.

---

## 20.3 Player Personal Notes

Players can create Personal Notes.

Personal Notes are:

- Owned by the Player
- Private by default
- Not readable by the DM
- Linkable to supported entities where privacy permits

---

## 20.4 Campaign Knowledge Visibility

Future Campaign content may support visibility scopes such as:

- DM Only
- Shared with Party
- Specific Players
- Personal

---

# 21. Phase 3 Requirements

Phase 3 delivers the complete Virtual Tabletop.

Required long-term feature areas:

- Maps
- Grid
- Tokens
- Token movement
- Realtime positioning
- Initiative integration
- Fog of War
- Dynamic Lighting
- Measurement tools
- Area-of-Effect templates
- Map assets
- Combat automation
- Encounter integration
- Character and Monster Sheet integration
- Dice
- Multiplayer realtime state

---

# 22. D&D Data Requirements

For the initial D&D implementation, game data will be sourced from **5e.tools**.

Expected imported content may include supported D&D data required by:

- Character Builder
- Monster Library
- Spells
- Classes
- Species / Races
- Backgrounds
- Items
- Features
- Rules references
- Character calculations

Data ingestion must be designed so that external rules/content data remains separable from core user-generated campaign data.

---

# 23. Rules Engine Requirements

A Rules Engine or equivalent rules abstraction is required.

The Rules Engine should determine ruleset-specific behavior such as:

- Character creation steps
- Valid options
- Prerequisites
- Derived stat formulas
- Level-up changes
- Ability calculations
- Initiative
- AC calculations
- HP progression
- Conditions
- Spellcasting
- Spell Slots
- Attack modifiers
- Save DC
- Death Saves
- Dice formulas
- Advancement rules

Core product screens should consume normalized rules outputs rather than directly encoding D&D-specific calculations.

---

# 24. Permissions Requirements

## DM

- Full Campaign management
- Full Character visibility
- Full Character editing
- Full Monster control
- Full Encounter control
- Full Combat control
- Can see Character Sheet sections hidden from other Players
- Can use secret rolls
- Can override Combat values

## Character Owner

- Full access to owned Character
- Can edit Character
- Can manage supported privacy settings
- Can participate in Combat

## Other Players

- Can view Party Character Sheets
- Cannot view sections marked private
- Cannot edit other Players' Characters

## Personal Notes

- Only owning Player can access
- DM cannot read
- Other Players cannot read unless a future explicit sharing capability is added

---

# 25. Non-Functional Requirements

## 25.1 Responsiveness

The application must support:

- Desktop
- Tablet
- Mobile

with role-appropriate layouts.

---

## 25.2 Realtime Performance

Combat actions should propagate quickly enough to feel live.

Realtime UX should avoid requiring manual refresh.

---

## 25.3 State Reliability

Active Combat state is high-value session data.

The system should:

- Autosave
- Minimize accidental state loss
- Recover gracefully after reconnect
- Keep an event history where useful

---

## 25.4 Extensibility

Architecture must support:

- Additional Game Systems
- Additional Rulesets
- New entity types
- Phase 2 linking
- VTT entities in Phase 3
- Co-DM
- Additional Homebrew content

without requiring a complete rewrite of Phase 1 data models.

---

## 25.5 Usability

The product should be powerful enough for experienced DMs while making Character creation and advancement approachable for newer Players.

DM experience:

- Dense where useful
- Fast
- Keyboard/mouse efficient
- Minimal navigation during live play

Player experience:

- Guided
- Clear
- Mobile-first
- Easy to operate during a Turn

---

# 26. Explicit Phase 1 Out of Scope

The following are intentionally excluded from Phase 1:

- Lore system
- NPC knowledge system
- Campaign Wiki
- Entity linking / backlinks
- Player Personal Notes
- Co-DM
- Homebrew Class
- Homebrew Subclass
- Homebrew Race / Species
- Homebrew Background
- Homebrew Spell
- Homebrew Item
- Homebrew Feat
- Battle Maps
- Tokens
- Fog of War
- Dynamic Lighting
- Map movement
- VTT map assets
- Full offline-first multiplayer

---

# 27. Product North Star for Phase 1

Primary DM experience:

`Open Campaign`
→ `Start Prepared Encounter`
→ `Manage Entire Combat From One Workspace`

Primary Player experience:

`Open Character`
→ `Join Active Combat`
→ `Take Turn Using Character Actions`
→ `Realtime State Updates`

The product should reduce the need for:

- Paper tracking
- Multiple browser tabs
- Separate dice tools
- Separate monster references
- Separate initiative trackers
- Manual HP bookkeeping

---

# 28. Success Criteria for Phase 1

Phase 1 should be considered successful when an experienced Dungeon Master can run a complete D&D combat using Table Companion while Players participate from their own devices.

A successful session should allow:

1. Characters to exist and be managed
2. Monsters to be selected or created
3. An Encounter to be prepared in advance
4. Combat to start from that Encounter
5. Initiative to be managed
6. Players to take their own turns
7. Rolls to execute from Sheets
8. Damage and healing to update state directly
9. Conditions and Death Saves to be tracked
10. DM to override mistakes
11. All participants to remain synchronized
12. Combat history to be retained

without requiring a separate combat management tool.

---

# 29. Future Expansion Summary

## Phase 1

**Play Engine**

- Character
- Monster
- Encounter
- Combat
- Dice
- Realtime

## Phase 2

**Campaign Brain**

- Lore
- NPCs
- Locations
- Quests
- Factions
- Notes
- Linked Entities
- Personal Notes

## Phase 3

**Virtual Tabletop**

- Maps
- Tokens
- Fog of War
- Dynamic Lighting
- Movement
- Multiplayer Tabletop
- Full encounter visualization

---

# 30. Final Product Model

The intended evolution is:

`Phase 1: Play Engine`
↓
`Phase 2: Campaign Brain`
↓
`Phase 3: Virtual Tabletop`

All phases should operate on the same underlying entities and rules architecture so that future capabilities extend the product rather than replace earlier systems.
