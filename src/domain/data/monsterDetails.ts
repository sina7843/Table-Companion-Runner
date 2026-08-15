/**
 * Full detail for the creatures a DM actually runs at the top of the range.
 *
 * The base library table gives every creature a usable stat line. This adds what a
 * high-difficulty creature needs to be run rather than merely picked: speed, senses,
 * saving throws, resistances, immunities, languages, and the action groups beyond plain
 * actions — reactions, legendary actions, and spells.
 *
 * Deliberately not applied to all fifty. A goblin has no legendary actions, and inventing
 * some so the data looks uniform would be worse than leaving it honest.
 */
import type { DerivedValue, MonsterActionGroup } from '../types.ts';

export interface MonsterDetail {
  /** Merged after the base stat line: speed, senses, saves, resistances, languages. */
  derived: DerivedValue[];
  /** Extra prose traits beyond the one the base table carries. */
  traits?: { name: string; description: string }[];
  /** Replaces the base single-action group entirely. */
  groups: MonsterActionGroup[];
}

const detail = (
  derived: [string, string, string | number][],
  groups: MonsterActionGroup[],
  traits?: { name: string; description: string }[],
): MonsterDetail => ({
  derived: derived.map(([key, label, value]) => ({ key, label, value })),
  groups,
  ...(traits ? { traits } : {}),
});

export const MONSTER_DETAILS: Record<string, MonsterDetail> = {
  'Adult Black Dragon': detail(
    [
      ['speed', 'Speed', '40 ft, fly 80 ft, swim 40 ft'],
      ['saves', 'Saving throws', 'DEX +7, CON +11, WIS +6, CHA +8'],
      ['skills', 'Skills', 'Perception +11, Stealth +7'],
      ['immunities', 'Damage immunities', 'Acid'],
      ['senses', 'Senses', 'Blindsight 60 ft, darkvision 120 ft, passive Perception 21'],
      ['languages', 'Languages', 'Common, Draconic'],
    ],
    [
      {
        key: 'actions',
        label: 'Actions',
        entries: [
          {
            name: 'Multiattack',
            description:
              'Uses Frightful Presence, then makes three attacks: one bite and two claws.',
          },
          {
            name: 'Bite',
            description: 'Melee weapon attack, reach 10 ft, one target.',
            attackBonus: '+11',
            damage: '2d10 + 6 piercing',
            tags: ['Plus 1d8 acid'],
          },
          {
            name: 'Claw',
            description: 'Melee weapon attack, reach 5 ft, one target.',
            attackBonus: '+11',
            damage: '2d6 + 6 slashing',
          },
          {
            name: 'Tail',
            description: 'Melee weapon attack, reach 15 ft, one target.',
            attackBonus: '+11',
            damage: '2d8 + 6 bludgeoning',
          },
          {
            name: 'Acid Breath',
            description: 'Exhales acid in a 60-foot line. DC 18 Dexterity save, half on a success.',
            damage: '12d8 acid',
            tags: ['Recharge 5–6'],
          },
          {
            name: 'Frightful Presence',
            description:
              'Each creature within 120 feet that can see the dragon makes a DC 16 Wisdom save or is frightened for one minute.',
            tags: ['1 per day'],
          },
        ],
      },
      {
        key: 'legendary',
        label: 'Legendary actions',
        note: '3 per round',
        entries: [
          {
            name: 'Detect',
            description: 'Makes a Wisdom (Perception) check.',
            rolls: [{ label: 'Perception', expression: '1d20 +11' }],
            tags: ['1 action'],
          },
          {
            name: 'Tail Attack',
            description: 'Makes one tail attack.',
            attackBonus: '+11',
            damage: '2d8 + 6 bludgeoning',
            tags: ['1 action'],
          },
          {
            name: 'Wing Attack',
            description:
              'Beats its wings. Each creature within 10 feet makes a DC 19 Dexterity save or takes damage and is knocked prone.',
            damage: '2d6 + 6 bludgeoning',
            tags: ['2 actions'],
          },
        ],
      },
      {
        key: 'reactions',
        label: 'Reactions',
        entries: [
          {
            name: 'Attack of Opportunity',
            description: 'Attacks a creature that leaves its reach.',
            attackBonus: '+11',
            damage: '2d10 + 6 piercing',
            tags: ['1 per round'],
          },
        ],
      },
    ],
    [
      { name: 'Amphibious', description: 'The dragon can breathe air and water.' },
      {
        name: 'Legendary Resistance',
        description:
          'Three times per day, when it fails a saving throw, it may choose to succeed instead.',
      },
    ],
  ),

  'Ancient Blue Dragon': detail(
    [
      ['speed', 'Speed', '40 ft, burrow 40 ft, fly 80 ft'],
      ['saves', 'Saving throws', 'DEX +9, CON +15, WIS +10, CHA +12'],
      ['skills', 'Skills', 'Perception +17, Stealth +9'],
      ['immunities', 'Damage immunities', 'Lightning'],
      ['senses', 'Senses', 'Blindsight 60 ft, darkvision 120 ft, passive Perception 27'],
      ['languages', 'Languages', 'Common, Draconic'],
    ],
    [
      {
        key: 'actions',
        label: 'Actions',
        entries: [
          {
            name: 'Multiattack',
            description: 'Uses Frightful Presence, then makes three attacks.',
          },
          {
            name: 'Bite',
            description: 'Melee weapon attack, reach 15 ft.',
            attackBonus: '+16',
            damage: '2d10 + 9 piercing',
            tags: ['Plus 2d10 lightning'],
          },
          {
            name: 'Claw',
            description: 'Melee weapon attack, reach 10 ft.',
            attackBonus: '+16',
            damage: '2d6 + 9 slashing',
          },
          {
            name: 'Lightning Breath',
            description: 'A 120-foot line, 10 feet wide. DC 23 Dexterity save, half on a success.',
            damage: '16d10 lightning',
            tags: ['Recharge 5–6'],
          },
        ],
      },
      {
        key: 'legendary',
        label: 'Legendary actions',
        note: '3 per round',
        entries: [
          {
            name: 'Detect',
            description: 'Makes a Wisdom (Perception) check.',
            rolls: [{ label: 'Perception', expression: '1d20 +17' }],
            tags: ['1 action'],
          },
          {
            name: 'Tail Attack',
            description: 'Makes one tail attack.',
            attackBonus: '+16',
            damage: '2d8 + 9 bludgeoning',
            tags: ['1 action'],
          },
          {
            name: 'Wing Attack',
            description: 'Each creature within 15 feet makes a DC 24 Dexterity save.',
            damage: '2d6 + 9 bludgeoning',
            tags: ['2 actions'],
          },
        ],
      },
      {
        key: 'reactions',
        label: 'Reactions',
        entries: [
          {
            name: 'Attack of Opportunity',
            description: 'Attacks a creature that leaves its reach.',
            attackBonus: '+16',
            damage: '2d10 + 9 piercing',
            tags: ['1 per round'],
          },
        ],
      },
    ],
    [
      {
        name: 'Legendary Resistance',
        description: 'Three times per day, may choose to succeed on a failed save.',
      },
    ],
  ),

  Beholder: detail(
    [
      ['speed', 'Speed', '0 ft, fly 20 ft (hover)'],
      ['saves', 'Saving throws', 'INT +8, WIS +7, CHA +8'],
      ['skills', 'Skills', 'Perception +12'],
      ['conditionImmunities', 'Condition immunities', 'Prone'],
      ['senses', 'Senses', 'Darkvision 120 ft, passive Perception 22'],
      ['languages', 'Languages', 'Deep Speech, Undercommon'],
    ],
    [
      {
        key: 'actions',
        label: 'Actions',
        entries: [
          {
            name: 'Bite',
            description: 'Melee weapon attack, reach 5 ft.',
            attackBonus: '+5',
            damage: '4d6 piercing',
          },
          {
            name: 'Eye Rays',
            description:
              'Fires three of the following rays at random, choosing one to three targets it can see within 120 feet.',
            tags: ['3 rays'],
          },
          {
            name: 'Charm Ray',
            description: 'DC 16 Wisdom save or charmed for one hour.',
            tags: ['Eye ray'],
          },
          {
            name: 'Paralysing Ray',
            description: 'DC 16 Constitution save or paralysed for one minute.',
            tags: ['Eye ray'],
          },
          {
            name: 'Fear Ray',
            description: 'DC 16 Wisdom save or frightened for one minute.',
            tags: ['Eye ray'],
          },
          {
            name: 'Disintegration Ray',
            description: 'DC 16 Dexterity save. A large or smaller object is disintegrated.',
            damage: '10d8 force',
            tags: ['Eye ray'],
          },
          {
            name: 'Death Ray',
            description: 'DC 16 Dexterity save.',
            damage: '10d10 necrotic',
            tags: ['Eye ray'],
          },
        ],
      },
      {
        key: 'legendary',
        label: 'Legendary actions',
        note: '3 per round',
        entries: [{ name: 'Eye Ray', description: 'Uses one random eye ray.', tags: ['1 action'] }],
      },
    ],
    [
      {
        name: 'Antimagic Cone',
        description:
          'Its central eye creates a 150-foot cone of antimagic. Spells and magical effects are suppressed inside it.',
      },
    ],
  ),

  'Mind Flayer': detail(
    [
      ['speed', 'Speed', '30 ft'],
      ['saves', 'Saving throws', 'INT +7, WIS +6, CHA +6'],
      ['skills', 'Skills', 'Arcana +7, Deception +6, Insight +6, Perception +6, Stealth +4'],
      ['senses', 'Senses', 'Darkvision 120 ft, passive Perception 16'],
      ['languages', 'Languages', 'Deep Speech, Undercommon, telepathy 120 ft'],
    ],
    [
      {
        key: 'actions',
        label: 'Actions',
        entries: [
          {
            name: 'Tentacles',
            description:
              'Melee attack, reach 5 ft. On a hit the target is grappled and must save or be stunned.',
            attackBonus: '+7',
            damage: '2d10 + 4 psychic',
          },
          {
            name: 'Extract Brain',
            description:
              'Against an incapacitated grappled humanoid. Kills the target if the damage reduces it to 0.',
            attackBonus: '+7',
            damage: '10d10 piercing',
          },
          {
            name: 'Mind Blast',
            description: 'A 60-foot cone. DC 15 Intelligence save, or stunned for one minute.',
            damage: '4d8 + 4 psychic',
            tags: ['Recharge 5–6'],
          },
        ],
      },
      {
        key: 'spells',
        label: 'Innate spellcasting',
        note: 'Intelligence, DC 15',
        entries: [
          {
            name: 'Detect Thoughts',
            description: 'Reads the surface thoughts of a creature it can see.',
            tier: 'At will',
          },
          {
            name: 'Levitate',
            description: 'Rises or descends vertically up to 20 feet.',
            tier: 'At will',
          },
          {
            name: 'Dominate Monster',
            description: 'DC 15 Wisdom save or charmed and commanded.',
            tier: '1 per day',
          },
          {
            name: 'Plane Shift',
            description: 'Transports itself to another plane of existence.',
            tier: '1 per day',
          },
        ],
      },
    ],
  ),

  Succubus: detail(
    [
      ['speed', 'Speed', '30 ft, fly 60 ft'],
      ['skills', 'Skills', 'Deception +9, Insight +5, Perception +5, Persuasion +9, Stealth +7'],
      ['resistances', 'Damage resistances', 'Cold, fire, lightning, poison'],
      ['senses', 'Senses', 'Darkvision 60 ft, passive Perception 15'],
      ['languages', 'Languages', 'Abyssal, Common, Infernal, telepathy 60 ft'],
    ],
    [
      {
        key: 'actions',
        label: 'Actions',
        entries: [
          {
            name: 'Claw',
            description: 'Melee attack in fiend form, reach 5 ft.',
            attackBonus: '+5',
            damage: '1d6 + 3 slashing',
          },
          {
            name: 'Charm',
            description:
              'One humanoid within 30 feet makes a DC 15 Wisdom save or is charmed for one day.',
            tags: ['1 per day'],
          },
          {
            name: 'Draining Kiss',
            description:
              'Against a charmed creature. Its hit point maximum drops by the damage taken.',
            damage: '5d10 + 5 psychic',
          },
          { name: 'Etherealness', description: 'Steps onto the Ethereal Plane and back.' },
        ],
      },
      {
        key: 'reactions',
        label: 'Reactions',
        entries: [
          {
            name: 'Shapechanger',
            description: 'Switches between its fiend form and a humanoid form as a bonus action.',
          },
        ],
      },
    ],
  ),

  Troll: detail(
    [
      ['speed', 'Speed', '30 ft'],
      ['skills', 'Skills', 'Perception +2'],
      ['senses', 'Senses', 'Darkvision 60 ft, passive Perception 12'],
      ['languages', 'Languages', 'Giant'],
    ],
    [
      {
        key: 'actions',
        label: 'Actions',
        entries: [
          { name: 'Multiattack', description: 'Makes three attacks: one bite and two claws.' },
          {
            name: 'Bite',
            description: 'Melee weapon attack, reach 5 ft.',
            attackBonus: '+7',
            damage: '1d6 + 4 piercing',
          },
          {
            name: 'Claw',
            description: 'Melee weapon attack, reach 5 ft.',
            attackBonus: '+7',
            damage: '2d6 + 4 slashing',
          },
        ],
      },
    ],
    [
      {
        name: 'Regeneration',
        description:
          'Regains 10 hit points at the start of its turn. If it takes acid or fire damage this does not function on its next turn.',
      },
      { name: 'Keen Smell', description: 'Advantage on Perception checks that rely on smell.' },
    ],
  ),
};
