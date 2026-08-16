/**
 * Fixture data.
 *
 * The content is lifted from the approved design's own sample data — the same party, the
 * same fight at the same round, the same monsters — so a screen built against these
 * fixtures can be compared directly with the design canvas. Realistic tabletop content,
 * never lorem ipsum.
 *
 * These are plain data objects. Nothing here imports the ruleset: derived values such as
 * armour class are computed by the adapter at read time, so the fixtures cannot drift out
 * of step with the rules.
 */
// The creature library is content now, not a literal in this file's neighbour. `Monster` is a
// core shape, so reading it back out of a content record crosses no seam.
import { libraryMonsters } from '../content/monsters.ts';
import {
  id,
  type Campaign,
  type CampaignActivity,
  type Character,
  type CombatInstance,
  type Condition,
  type EncounterTemplate,
  type Monster,
  type RecentItem,
  type Roll,
  type User,
} from '../types.ts';

const SYSTEM_ID = id<'GameSystem'>('dnd5e-2024');

/* ── Users ──────────────────────────────────────────────────────────────────── */

export const USERS: User[] = [
  { id: id<'User'>('u-marta'), displayName: 'Marta' },
  { id: id<'User'>('u-priya'), displayName: 'Priya' },
  { id: id<'User'>('u-tomas'), displayName: 'Tomás' },
  { id: id<'User'>('u-devin'), displayName: 'Devin' },
];

export const CURRENT_USER_ID = id<'User'>('u-marta');

/* ── Campaigns ──────────────────────────────────────────────────────────────── */

export const CAMPAIGNS: Campaign[] = [
  {
    id: id<'Campaign'>('c-lmop'),
    name: 'Lost Mine of Phandelver',
    systemId: SYSTEM_ID,
    dmUserId: id<'User'>('u-marta'),
    inviteCode: 'CRAGMAW-7742',
    createdAt: '2026-05-02T18:00:00.000Z',
    members: [
      { userId: id<'User'>('u-marta'), role: 'dm' },
      {
        userId: id<'User'>('u-priya'),
        role: 'player',
        characterId: id<'Character'>('ch-thessaly'),
      },
      { userId: id<'User'>('u-tomas'), role: 'player', characterId: id<'Character'>('ch-bram') },
      { userId: id<'User'>('u-devin'), role: 'player', characterId: id<'Character'>('ch-quill') },
    ],
  },
  {
    id: id<'Campaign'>('c-strahd'),
    name: 'Curse of Strahd',
    systemId: SYSTEM_ID,
    dmUserId: id<'User'>('u-marta'),
    inviteCode: 'BAROVIA-1031',
    createdAt: '2026-07-19T18:00:00.000Z',
    members: [{ userId: id<'User'>('u-marta'), role: 'dm' }],
  },
];

/* ── Conditions in play ─────────────────────────────────────────────────────── */

function condition(
  key: string,
  label: string,
  tone: Condition['tone'],
  duration?: string,
): Condition {
  return { id: id<'Condition'>(`cond-${key}-${label}`), key, label, tone, duration };
}

/* ── Characters ─────────────────────────────────────────────────────────────── */

const abilities = (
  str: number,
  dex: number,
  con: number,
  int: number,
  wis: number,
  cha: number,
) => [
  { key: 'str', label: 'STR', value: str },
  { key: 'dex', label: 'DEX', value: dex },
  { key: 'con', label: 'CON', value: con },
  { key: 'int', label: 'INT', value: int },
  { key: 'wis', label: 'WIS', value: wis },
  { key: 'cha', label: 'CHA', value: cha },
];

export const CHARACTERS: Character[] = [
  {
    id: id<'Character'>('ch-aria'),
    systemId: SYSTEM_ID,
    campaignId: id<'Campaign'>('c-lmop'),
    ownerUserId: id<'User'>('u-marta'),
    name: 'Aria Nightfall',
    archetype: 'Fighter',
    subtitle: 'Human Fighter 6',
    level: 6,
    attributes: abilities(17, 14, 15, 10, 12, 13),
    resources: [{ key: 'superiority', label: 'Superiority dice', max: 4, used: 0 }],
    health: { current: 47, max: 58, temporary: 5 },
    conditions: [condition('bless', 'Bless', 'buff', '8 rounds')],
    sectionVisibility: {},
    systemData: {
      classKey: 'fighter',
      skills: ['Athletics', 'Intimidation', 'Perception', 'Survival'],
      className: 'Fighter',
      subclass: 'Battle Master',
      species: 'Human',
      background: 'Soldier',
      armour: 'chain-mail',
      shield: true,
    },
  },
  {
    id: id<'Character'>('ch-thessaly'),
    systemId: SYSTEM_ID,
    campaignId: id<'Campaign'>('c-lmop'),
    ownerUserId: id<'User'>('u-priya'),
    name: 'Thessaly Vane',
    archetype: 'Warlock',
    subtitle: 'Half-elf Warlock 6',
    level: 6,
    attributes: abilities(8, 14, 14, 12, 11, 17),
    resources: [],
    health: { current: 12, max: 41, temporary: 0 },
    conditions: [
      condition('hex', 'Hex', 'concentration', '1 min'),
      condition('frightened', 'Frightened', 'debuff', '1 round'),
    ],
    sectionVisibility: {},
    systemData: {
      classKey: 'warlock',
      skills: ['Deception', 'Arcana', 'Investigation'],
      className: 'Warlock',
      subclass: 'The Fiend',
      species: 'Half-elf',
      background: 'Charlatan',
      armour: 'leather',
      shield: false,
    },
  },
  {
    id: id<'Character'>('ch-bram'),
    systemId: SYSTEM_ID,
    campaignId: id<'Campaign'>('c-lmop'),
    ownerUserId: id<'User'>('u-tomas'),
    name: 'Bram Ironfoot',
    archetype: 'Cleric',
    subtitle: 'Dwarf Cleric 6',
    level: 6,
    attributes: abilities(14, 10, 16, 10, 17, 12),
    resources: [],
    health: { current: 0, max: 52, temporary: 0 },
    conditions: [],
    // Bram has hidden his inventory from the party. Marta, as DM, still sees it.
    sectionVisibility: { inventory: 'private' },
    systemData: {
      classKey: 'cleric',
      skills: ['Insight', 'Religion', 'Medicine', 'Persuasion'],
      className: 'Cleric',
      subclass: 'Life Domain',
      species: 'Dwarf',
      background: 'Acolyte',
      armour: 'chain-mail',
      shield: true,
    },
  },
  {
    id: id<'Character'>('ch-quill'),
    systemId: SYSTEM_ID,
    campaignId: id<'Campaign'>('c-lmop'),
    ownerUserId: id<'User'>('u-devin'),
    name: 'Quill Featherwind',
    archetype: 'Rogue',
    subtitle: 'Halfling Rogue 7',
    level: 7,
    attributes: abilities(10, 18, 14, 13, 12, 14),
    resources: [],
    health: { current: 38, max: 44, temporary: 0 },
    conditions: [],
    sectionVisibility: { background: 'private' },
    systemData: {
      classKey: 'rogue',
      skills: [
        'Stealth',
        'Sleight of Hand',
        'Acrobatics',
        'Perception',
        'Deception',
        'Investigation',
      ],
      className: 'Rogue',
      subclass: 'Assassin',
      species: 'Halfling',
      background: 'Criminal',
      armour: 'studded-leather',
      shield: false,
    },
  },
  {
    id: id<'Character'>('ch-wren'),
    systemId: SYSTEM_ID,
    ownerUserId: id<'User'>('u-marta'),
    name: 'Wren of the Ninth Hollow',
    archetype: 'Druid',
    subtitle: 'Wood Elf Druid 3',
    level: 3,
    attributes: abilities(10, 14, 13, 12, 16, 11),
    resources: [],
    health: { current: 24, max: 24, temporary: 0 },
    conditions: [],
    sectionVisibility: {},
    systemData: {
      classKey: 'druid',
      skills: ['Nature', 'Survival', 'Medicine', 'Perception'],
      className: 'Druid',
      species: 'Wood Elf',
      background: 'Hermit',
      armour: 'leather',
      shield: false,
    },
  },
  {
    id: id<'Character'>('ch-osric'),
    systemId: SYSTEM_ID,
    ownerUserId: id<'User'>('u-marta'),
    name: 'Osric Quillsworth',
    archetype: 'Wizard',
    subtitle: 'Human Wizard 1',
    level: 1,
    attributes: abilities(8, 13, 12, 17, 11, 10),
    resources: [],
    health: { current: 8, max: 8, temporary: 0 },
    conditions: [],
    sectionVisibility: {},
    draft: { step: 5, totalSteps: 10 },
    systemData: {
      classKey: 'wizard',
      skills: ['Arcana', 'History'],
      className: 'Wizard',
      species: 'Human',
      background: 'Sage',
      armour: 'none',
      shield: false,
    },
  },
];

// Quill has an unspent level up waiting, which the DM home surfaces before play.
const quill = CHARACTERS.find((character) => character.id === id<'Character'>('ch-quill'));
if (quill) quill.pendingLevelUp = true;

/* ── Monsters ───────────────────────────────────────────────────────────────── */

/**
 * The library, plus the DM's own homebrew.
 *
 * Homebrew is not filed in a separate library: the design's rule is that a DM searching
 * for a goblin should find their edited goblin next to the printed one, because the
 * distinction matters for trust rather than for navigation.
 */
export const MONSTERS: Monster[] = [
  ...libraryMonsters(),
  {
    id: id<'Monster'>('m-cragmaw-ambusher'),
    systemId: SYSTEM_ID,
    name: 'Cragmaw Ambusher',
    subtitle: 'Medium humanoid (goblinoid), neutral evil',
    origin: 'homebrew',
    ownerUserId: id<'User'>('u-marta'),
    source: 'Marta',
    challengeLabel: 'CR 1',
    challengeRank: 1,
    facets: { type: ['Humanoid'], size: ['Medium'], environment: ['Forest'] },
    attributes: abilities(12, 16, 12, 10, 11, 9),
    health: { current: 21, max: 21, temporary: 0 },
    derived: [
      { key: 'ac', label: 'Armour class', value: 14 },
      { key: 'hp', label: 'Hit points', value: 21 },
      { key: 'challenge', label: 'Challenge', value: 'CR 1' },
      // Homebrew has to be runnable too: a creature without a speed or a sense line
      // cannot actually be used at the table.
      { key: 'speed', label: 'Speed', value: '30 ft' },
      { key: 'senses', label: 'Senses', value: 'Darkvision 60 ft, passive Perception 11' },
      { key: 'languages', label: 'Languages', value: 'Common, Goblin' },
    ],
    traits: [
      {
        name: 'Ambusher',
        description: 'Advantage on attack rolls against any creature it has surprised.',
      },
    ],
    actionGroups: [
      {
        key: 'actions',
        label: 'Actions',
        entries: [
          {
            name: 'Shortsword',
            description: 'Melee weapon attack, reach 5 ft.',
            attackBonus: '+5',
            damage: '1d6 + 3 piercing',
          },
        ],
      },
    ],
    systemData: { type: 'Humanoid', size: 'Medium' },
  },
];

/* ── Encounters ─────────────────────────────────────────────────────────────── */

/**
 * A campaign's worth of prepared fights.
 *
 * Difficulty is deliberately not stored: the ruleset computes it against the party as it
 * is today, so a level-up changes what the encounter table says. A stored label would go
 * stale the first time someone gained a level, and two sources for one number is how they
 * end up disagreeing.
 *
 * Twelve entries rather than a token three, because the list is the screen that grows
 * with content and it should be exercised at the length a real adventure produces.
 */
export const ENCOUNTERS: EncounterTemplate[] = [
  {
    id: id<'EncounterTemplate'>('e-goblin-ambush'),
    campaignId: id<'Campaign'>('c-lmop'),
    name: 'Goblin Ambush',
    location: 'Cragmaw Hideout',
    notes:
      'Two goblins open from the ridge with shortbows; the Chief only reveals himself once a player crosses the stream. The Ambusher stays hidden until round 3 — start it with initiative 6 so it acts last.',
    updatedAt: '2026-08-15T19:08:00.000Z',
    lastRunAt: '2026-08-15T19:12:00.000Z',
    entries: [
      { id: 'e1', monsterId: id<'Monster'>('m-bugbear-chief'), count: 1 },
      { id: 'e2', monsterId: id<'Monster'>('m-goblin'), count: 4 },
      { id: 'e3', monsterId: id<'Monster'>('m-cragmaw-ambusher'), count: 1, hidden: true },
    ],
  },
  {
    id: id<'EncounterTemplate'>('e-cragmaw-castle'),
    campaignId: id<'Campaign'>('c-lmop'),
    name: 'Assault on Cragmaw Castle',
    location: 'Cragmaw Castle',
    notes:
      'King Grol holds the north tower with Ripper. The goblins in the banquet hall join on round 2 if anyone shouts — give the party one round to be quiet about it.',
    updatedAt: '2026-08-14T16:20:00.000Z',
    entries: [
      { id: 'e1', monsterId: id<'Monster'>('m-goblin'), count: 8 },
      { id: 'e2', monsterId: id<'Monster'>('m-bugbear'), count: 4 },
      { id: 'e3', monsterId: id<'Monster'>('m-hobgoblin'), count: 3 },
      { id: 'e4', monsterId: id<'Monster'>('m-dire-wolf'), count: 1, hidden: true },
    ],
  },
  {
    id: id<'EncounterTemplate'>('e-redbrand'),
    campaignId: id<'Campaign'>('c-lmop'),
    name: 'The Redbrand Hideout',
    location: 'Tresendar Manor',
    notes:
      'The ruffians fight to the death only while Glasstaff is alive. Once he flees, offer a surrender.',
    updatedAt: '2026-08-11T18:40:00.000Z',
    lastRunAt: '2026-08-11T19:00:00.000Z',
    entries: [
      { id: 'e1', monsterId: id<'Monster'>('m-bandit'), count: 6 },
      { id: 'e2', monsterId: id<'Monster'>('m-bandit-captain'), count: 1 },
      { id: 'e3', monsterId: id<'Monster'>('m-veteran'), count: 1 },
    ],
  },
  {
    id: id<'EncounterTemplate'>('e-wave-echo'),
    campaignId: id<'Campaign'>('c-lmop'),
    name: 'Wave Echo Cave — first landing',
    location: 'Wave Echo Cave',
    notes:
      'The skeletons rise from the water as the party reaches the second bridge. The wight stays on the far bank and commands them.',
    updatedAt: '2026-08-09T20:15:00.000Z',
    entries: [
      { id: 'e1', monsterId: id<'Monster'>('m-wight'), count: 1 },
      { id: 'e2', monsterId: id<'Monster'>('m-skeleton'), count: 8 },
      { id: 'e3', monsterId: id<'Monster'>('m-gargoyle'), count: 1 },
    ],
  },
  {
    id: id<'EncounterTemplate'>('e-owlbear'),
    campaignId: id<'Campaign'>('c-lmop'),
    name: 'Owlbear in the ravine',
    location: 'Triboar Trail',
    notes:
      'Not a fight unless they make it one. The owlbear is guarding a kill and will back off if given room.',
    updatedAt: '2026-08-02T11:05:00.000Z',
    entries: [{ id: 'e1', monsterId: id<'Monster'>('m-owlbear'), count: 1 }],
  },
  {
    id: id<'EncounterTemplate'>('e-thundertree'),
    campaignId: id<'Campaign'>('c-lmop'),
    name: 'Ruins of Thundertree — ash zombies',
    location: 'Thundertree',
    notes:
      'They come out of three buildings at once. Spread the initiative so the party is never surrounded on the first round. The hag watches from the tower and only joins if the fight goes long.',
    updatedAt: '2026-07-30T19:50:00.000Z',
    entries: [
      { id: 'e1', monsterId: id<'Monster'>('m-zombie'), count: 10 },
      { id: 'e2', monsterId: id<'Monster'>('m-green-hag'), count: 1, hidden: true },
    ],
  },
  {
    id: id<'EncounterTemplate'>('e-twin-spiders'),
    campaignId: id<'Campaign'>('c-lmop'),
    name: 'Webs in the old mill',
    location: 'Phandalin',
    updatedAt: '2026-07-28T09:30:00.000Z',
    entries: [{ id: 'e1', monsterId: id<'Monster'>('m-giant-spider'), count: 5 }],
  },
  {
    id: id<'EncounterTemplate'>('e-orc-raiders'),
    campaignId: id<'Campaign'>('c-lmop'),
    name: 'Orc raiders at Wyvern Tor',
    location: 'Wyvern Tor',
    notes:
      'The ogre is asleep at the back of the cave. It joins on round 3 unless the party is quiet.',
    updatedAt: '2026-07-25T17:12:00.000Z',
    lastRunAt: '2026-07-26T18:30:00.000Z',
    entries: [
      { id: 'e1', monsterId: id<'Monster'>('m-orc'), count: 8 },
      { id: 'e2', monsterId: id<'Monster'>('m-ogre'), count: 2, hidden: true },
    ],
  },
  {
    id: id<'EncounterTemplate'>('e-kobold-warren'),
    campaignId: id<'Campaign'>('c-lmop'),
    name: 'Kobold warren',
    location: 'Old Owl Well',
    updatedAt: '2026-07-21T14:00:00.000Z',
    entries: [{ id: 'e1', monsterId: id<'Monster'>('m-kobold'), count: 12 }],
  },
  {
    id: id<'EncounterTemplate'>('e-cultists'),
    campaignId: id<'Campaign'>('c-lmop'),
    name: 'The Dragon Cult in the barrow',
    location: 'Old Owl Well',
    notes:
      'The cultists are stalling for the ritual, not trying to win. Two rounds of talking is a legitimate outcome.',
    updatedAt: '2026-07-18T21:45:00.000Z',
    entries: [
      { id: 'e1', monsterId: id<'Monster'>('m-cultist'), count: 8 },
      { id: 'e2', monsterId: id<'Monster'>('m-veteran'), count: 2 },
    ],
  },
  {
    id: id<'EncounterTemplate'>('e-ghouls'),
    campaignId: id<'Campaign'>('c-lmop'),
    name: 'Ghouls under the graveyard',
    location: 'Phandalin',
    updatedAt: '2026-07-12T20:10:00.000Z',
    entries: [{ id: 'e1', monsterId: id<'Monster'>('m-ghoul'), count: 4 }],
  },
  {
    id: id<'EncounterTemplate'>('e-wolves'),
    campaignId: id<'Campaign'>('c-lmop'),
    name: 'Wolves on the road',
    location: 'Triboar Trail',
    updatedAt: '2026-07-04T08:25:00.000Z',
    lastRunAt: '2026-07-04T19:15:00.000Z',
    entries: [{ id: 'e1', monsterId: id<'Monster'>('m-wolf'), count: 4 }],
  },

  // A campaign with a DM and no players yet. The difficulty metric has nothing to rate
  // against, and the screens have to say so rather than printing a confident number.
  {
    id: id<'EncounterTemplate'>('e-death-house'),
    campaignId: id<'Campaign'>('c-strahd'),
    name: 'Death House — the attic',
    location: 'Death House',
    updatedAt: '2026-07-20T22:00:00.000Z',
    entries: [{ id: 'e1', monsterId: id<'Monster'>('m-ghoul'), count: 2 }],
  },
];

/* ── The live combat ────────────────────────────────────────────────────────── */

const LMOP = id<'Campaign'>('c-lmop');

export const COMBATS: CombatInstance[] = [
  {
    id: id<'CombatInstance'>('cb-goblin-ambush'),
    campaignId: LMOP,
    encounterTemplateId: id<'EncounterTemplate'>('e-goblin-ambush'),
    name: 'Goblin Ambush',
    location: 'Cragmaw Hideout',
    status: 'live',
    round: 3,
    activeParticipantId: id<'CombatParticipant'>('p-bugbear-chief'),
    startedAt: '2026-08-15T19:12:00.000Z',
    participants: [
      {
        id: id<'CombatParticipant'>('p-quill'),
        name: 'Quill Featherwind',
        subtitle: 'Halfling Rogue 6 · Devin',
        entityType: 'player',
        initiative: 24,
        health: { current: 38, max: 44, temporary: 0 },
        conditions: [],
        state: 'waiting',
        visibility: 'party',
        source: { kind: 'character', characterId: id<'Character'>('ch-quill') },
      },
      {
        id: id<'CombatParticipant'>('p-aria'),
        name: 'Aria Nightfall',
        subtitle: 'Human Fighter 6 · Marta',
        entityType: 'player',
        initiative: 21,
        health: { current: 47, max: 58, temporary: 5 },
        conditions: [condition('bless', 'Bless', 'buff', '8 rounds')],
        state: 'waiting',
        visibility: 'party',
        source: { kind: 'character', characterId: id<'Character'>('ch-aria') },
      },
      {
        id: id<'CombatParticipant'>('p-bugbear-chief'),
        name: 'Bugbear Chief',
        subtitle: 'CR 3 · Cragmaw',
        entityType: 'monster',
        initiative: 19,
        health: { current: 27, max: 33, temporary: 0 },
        conditions: [],
        state: 'active',
        visibility: 'party',
        source: { kind: 'monster', monsterId: id<'Monster'>('m-bugbear-chief') },
      },
      {
        id: id<'CombatParticipant'>('p-goblin-1'),
        name: 'Goblin #1',
        subtitle: 'CR 1/4',
        entityType: 'monster',
        initiative: 17,
        health: { current: 0, max: 7, temporary: 0 },
        conditions: [],
        state: 'defeated',
        visibility: 'party',
        groupKey: 'goblin',
        source: { kind: 'monster', monsterId: id<'Monster'>('m-goblin') },
      },
      {
        id: id<'CombatParticipant'>('p-goblin-2'),
        name: 'Goblin #2',
        subtitle: 'CR 1/4',
        entityType: 'monster',
        initiative: 17,
        health: { current: 3, max: 7, temporary: 0 },
        conditions: [condition('poisoned', 'Poisoned', 'debuff', '2 rounds')],
        state: 'waiting',
        visibility: 'party',
        groupKey: 'goblin',
        source: { kind: 'monster', monsterId: id<'Monster'>('m-goblin') },
      },
      {
        id: id<'CombatParticipant'>('p-thessaly'),
        name: 'Thessaly Vane',
        subtitle: 'Half-elf Warlock 6 · Priya',
        entityType: 'player',
        initiative: 14,
        health: { current: 12, max: 41, temporary: 0 },
        conditions: [
          condition('hex', 'Hex', 'concentration', '1 min'),
          condition('frightened', 'Frightened', 'debuff', '1 round'),
          condition('prone', 'Prone', 'debuff'),
          condition('bless', 'Bless', 'buff', '8 rounds'),
        ],
        state: 'waiting',
        visibility: 'party',
        source: { kind: 'character', characterId: id<'Character'>('ch-thessaly') },
      },
      {
        id: id<'CombatParticipant'>('p-sildar'),
        name: 'Sildar Hallwinter',
        subtitle: 'NPC ally · Veteran',
        entityType: 'npc',
        initiative: 12,
        health: { current: 24, max: 27, temporary: 0 },
        conditions: [],
        state: 'waiting',
        visibility: 'party',
        source: { kind: 'monster', monsterId: id<'Monster'>('m-veteran') },
      },
      {
        id: id<'CombatParticipant'>('p-wolf-1'),
        name: 'Wolf #1',
        subtitle: 'CR 1/4 · pack tactics',
        entityType: 'monster',
        initiative: 12,
        health: { current: 11, max: 11, temporary: 0 },
        conditions: [],
        state: 'waiting',
        visibility: 'party',
        groupKey: 'wolf',
        source: { kind: 'monster', monsterId: id<'Monster'>('m-wolf') },
      },
      {
        id: id<'CombatParticipant'>('p-wolf-2'),
        name: 'Wolf #2',
        subtitle: 'CR 1/4 · pack tactics',
        entityType: 'monster',
        initiative: 12,
        health: { current: 4, max: 11, temporary: 0 },
        conditions: [condition('frightened', 'Frightened', 'debuff', '1 round')],
        state: 'waiting',
        visibility: 'party',
        groupKey: 'wolf',
        source: { kind: 'monster', monsterId: id<'Monster'>('m-wolf') },
      },
      {
        id: id<'CombatParticipant'>('p-goblin-3'),
        name: 'Goblin #3',
        subtitle: 'CR 1/4',
        entityType: 'monster',
        initiative: 11,
        health: { current: 7, max: 7, temporary: 0 },
        conditions: [],
        state: 'waiting',
        visibility: 'party',
        groupKey: 'goblin',
        source: { kind: 'monster', monsterId: id<'Monster'>('m-goblin') },
      },
      {
        id: id<'CombatParticipant'>('p-goblin-4'),
        name: 'Goblin #4',
        subtitle: 'CR 1/4',
        entityType: 'monster',
        initiative: 11,
        health: { current: 2, max: 7, temporary: 0 },
        conditions: [condition('prone', 'Prone', 'debuff')],
        state: 'waiting',
        visibility: 'party',
        groupKey: 'goblin',
        source: { kind: 'monster', monsterId: id<'Monster'>('m-goblin') },
      },
      {
        id: id<'CombatParticipant'>('p-bram'),
        name: 'Bram Ironfoot',
        subtitle: 'Dwarf Cleric 6 · Tomás',
        entityType: 'player',
        initiative: 9,
        health: { current: 0, max: 52, temporary: 0 },
        conditions: [],
        state: 'unconscious',
        deathSaves: { successes: 1, failures: 2 },
        visibility: 'party',
        source: { kind: 'character', characterId: id<'Character'>('ch-bram') },
      },
      {
        id: id<'CombatParticipant'>('p-ambusher'),
        name: 'Cragmaw Ambusher',
        subtitle: 'CR 1 · hidden until it acts',
        entityType: 'monster',
        initiative: 6,
        health: { current: 21, max: 21, temporary: 0 },
        conditions: [],
        state: 'waiting',
        // Exists in the DM's order, absent from every player device.
        visibility: 'dm-only',
        source: { kind: 'monster', monsterId: id<'Monster'>('m-cragmaw-ambusher') },
      },
    ],
  },
];

/* ── Combats already fought ─────────────────────────────────────────────────── */

/**
 * An encounter template can be run more than once, and each run is its own instance —
 * which is why the Redbrand Hideout appears both as a prepared template and as a combat
 * that already happened.
 */
COMBATS.push(
  {
    id: id<'CombatInstance'>('cb-redbrand'),
    campaignId: LMOP,
    encounterTemplateId: id<'EncounterTemplate'>('e-redbrand'),
    name: 'The Redbrand Hideout',
    location: 'Tresendar Manor',
    status: 'ended',
    round: 6,
    activeParticipantId: null,
    participants: [],
    startedAt: '2026-08-11T19:04:00.000Z',
    endedAt: '2026-08-11T20:31:00.000Z',
  },
  {
    id: id<'CombatInstance'>('cb-triboar'),
    campaignId: LMOP,
    name: 'Ambush on the Triboar Trail',
    location: 'Triboar Trail',
    status: 'ended',
    round: 4,
    activeParticipantId: null,
    participants: [],
    startedAt: '2026-08-04T18:40:00.000Z',
    endedAt: '2026-08-04T19:22:00.000Z',
  },
);

/* ── Roll log ───────────────────────────────────────────────────────────────── */

const COMBAT_ID = id<'CombatInstance'>('cb-goblin-ambush');

export const ROLLS: Roll[] = [
  {
    id: id<'Roll'>('r-1'),
    combatId: COMBAT_ID,
    actor: 'Bugbear Chief',
    title: 'Bugbear Chief — Morningstar attack',
    expression: '1d20 + 5',
    mode: 'normal',
    dice: [{ sides: 20, value: 17 }],
    modifier: 5,
    total: 22,
    outcome: 'normal',
    visibility: 'party',
    at: '2026-08-15T19:43:00.000Z',
  },
  {
    id: id<'Roll'>('r-2'),
    combatId: COMBAT_ID,
    actor: 'Aria Nightfall',
    title: 'Aria Nightfall — Longsword damage',
    expression: '1d8 + 4',
    mode: 'normal',
    dice: [{ sides: 8, value: 9 }],
    modifier: 4,
    total: 13,
    outcome: 'normal',
    visibility: 'party',
    at: '2026-08-15T19:42:00.000Z',
  },
  {
    id: id<'Roll'>('r-3'),
    combatId: COMBAT_ID,
    actor: 'Quill Featherwind',
    title: 'Quill Featherwind — Sneak Attack damage',
    expression: '3d6 + 4',
    mode: 'normal',
    dice: [
      { sides: 6, value: 6 },
      { sides: 6, value: 5 },
      { sides: 6, value: 9 },
    ],
    modifier: 4,
    total: 24,
    outcome: 'critical',
    visibility: 'party',
    at: '2026-08-15T19:41:00.000Z',
  },
  {
    id: id<'Roll'>('r-4'),
    combatId: COMBAT_ID,
    actor: 'Cragmaw Ambusher',
    title: 'Cragmaw Ambusher — Stealth',
    expression: '1d20 + 6',
    mode: 'normal',
    dice: [{ sides: 20, value: 17 }],
    modifier: 6,
    total: 23,
    outcome: 'normal',
    // The DM chose to keep this one secret.
    visibility: 'secret',
    at: '2026-08-15T19:44:00.000Z',
  },
];

/* ── Recall and activity ────────────────────────────────────────────────────── */

/**
 * "Recently opened". A mixed list, most recent first — the design's point is that a DM
 * preparing a session returns to the same handful of things rather than searching afresh.
 */
export const RECENTS: RecentItem[] = [
  {
    id: 'rc-1',
    kind: 'monster',
    label: 'Adult Black Dragon',
    href: '/dm/monsters/m-adult-black-dragon',
    at: '2026-08-15T18:58:00.000Z',
  },
  {
    id: 'rc-2',
    kind: 'monster',
    label: 'Bugbear Chief',
    href: '/dm/monsters/m-bugbear-chief',
    at: '2026-08-15T18:44:00.000Z',
  },
  {
    id: 'rc-3',
    kind: 'combat',
    label: 'Goblin Ambush',
    href: '/dm/combat/cb-goblin-ambush',
    at: '2026-08-15T19:12:00.000Z',
  },
  {
    id: 'rc-4',
    kind: 'character',
    label: 'Aria Nightfall',
    href: '/dm/characters/ch-aria',
    at: '2026-08-15T17:20:00.000Z',
  },
  {
    id: 'rc-5',
    kind: 'monster',
    label: 'Cragmaw Ambusher',
    href: '/dm/monsters/m-cragmaw-ambusher',
    at: '2026-08-14T21:05:00.000Z',
  },
  {
    id: 'rc-6',
    kind: 'spell',
    label: 'Fireball',
    href: '/dm/spells',
    at: '2026-08-14T20:31:00.000Z',
  },
  {
    id: 'rc-7',
    kind: 'encounter',
    label: 'Assault on Cragmaw Castle',
    href: '/dm/encounters/e-cragmaw-castle',
    at: '2026-08-13T19:47:00.000Z',
  },
];

/**
 * What the party changed since the DM last looked. A work queue, not analytics — every
 * row is something a DM genuinely needs to know before play starts.
 */
export const ACTIVITY: CampaignActivity[] = [
  {
    id: 'ac-1',
    campaignId: id<'Campaign'>('c-lmop'),
    kind: 'levelled',
    summary: 'Quill Featherwind reached level 7',
    detail: 'Devin · 2 hours ago · Assassinate added',
    characterId: id<'Character'>('ch-quill'),
    at: '2026-08-15T17:10:00.000Z',
  },
  {
    id: 'ac-2',
    campaignId: id<'Campaign'>('c-lmop'),
    kind: 'level-up-pending',
    summary: 'Thessaly Vane has an unspent level up',
    detail: 'Priya · waiting since last session',
    characterId: id<'Character'>('ch-thessaly'),
    at: '2026-08-14T22:00:00.000Z',
  },
  {
    id: 'ac-3',
    campaignId: id<'Campaign'>('c-lmop'),
    kind: 'privacy-changed',
    summary: 'Bram Ironfoot hid his inventory from the party',
    detail: 'Tomás · yesterday · still visible to you',
    characterId: id<'Character'>('ch-bram'),
    at: '2026-08-14T19:30:00.000Z',
  },
  {
    id: 'ac-4',
    campaignId: id<'Campaign'>('c-lmop'),
    kind: 'character-edited',
    summary: 'Aria Nightfall edited her backstory',
    detail: 'Marta · 3 days ago',
    characterId: id<'Character'>('ch-aria'),
    at: '2026-08-12T11:15:00.000Z',
  },
];
