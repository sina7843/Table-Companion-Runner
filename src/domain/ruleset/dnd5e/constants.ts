/**
 * D&D 5e (2024) constants.
 *
 * Every D&D-specific number and name in the product lives in this directory. If a value
 * from here is needed outside `ruleset/dnd5e`, that is the signal to widen the `Ruleset`
 * interface instead of importing across the boundary.
 */

export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
};

export const ABILITY_NAMES: Record<AbilityKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

/** 5e's ability modifier: (score − 10) halved, rounded down. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Proficiency bonus by character level: +2 at 1–4, rising every four levels to +6. */
export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);
}

/** Base armour class before armour, shields or class features. */
export const UNARMOURED_BASE_AC = 10;

/** Armour the fixtures and builder reference. Dex cap is null when unlimited. */
export interface ArmourDefinition {
  key: string;
  label: string;
  baseAc: number;
  dexCap: number | null;
}

export const ARMOUR: Record<string, ArmourDefinition> = {
  none: { key: 'none', label: 'No armour', baseAc: UNARMOURED_BASE_AC, dexCap: null },
  leather: { key: 'leather', label: 'Leather', baseAc: 11, dexCap: null },
  'studded-leather': { key: 'studded-leather', label: 'Studded leather', baseAc: 12, dexCap: null },
  'scale-mail': { key: 'scale-mail', label: 'Scale mail', baseAc: 14, dexCap: 2 },
  'chain-mail': { key: 'chain-mail', label: 'Chain mail', baseAc: 16, dexCap: 0 },
  plate: { key: 'plate', label: 'Plate', baseAc: 18, dexCap: 0 },
};

export const SHIELD_BONUS = 2;

/** Death saves: three successes stabilise, three failures kill. */
export const DEATH_SAVE_TARGET = 3;

/** Full-caster spell slots by character level, index 0 = 1st level slots. */
export const FULL_CASTER_SLOTS: readonly (readonly number[])[] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
];

/** Classes that get the full-caster progression above. */
export const FULL_CASTER_CLASSES = new Set(['bard', 'cleric', 'druid', 'sorcerer', 'wizard']);
export const HALF_CASTER_CLASSES = new Set(['paladin', 'ranger', 'artificer']);
/** Warlock uses pact magic — a different table, handled as a special case. */
export const PACT_CASTER_CLASSES = new Set(['warlock']);

export const PACT_SLOTS_BY_LEVEL: readonly { count: number; level: number }[] = [
  { count: 1, level: 1 },
  { count: 2, level: 1 },
  { count: 2, level: 2 },
  { count: 2, level: 2 },
  { count: 2, level: 3 },
  { count: 2, level: 3 },
  { count: 2, level: 4 },
  { count: 2, level: 4 },
  { count: 2, level: 5 },
  { count: 2, level: 5 },
];

/** The 2024 condition list, with the tone and glyph the design pairs each with. */
export const CONDITIONS = [
  {
    key: 'blinded',
    label: 'Blinded',
    tone: 'debuff',
    icon: 'eye-slash',
    description: 'Cannot see; attacks against have advantage.',
  },
  {
    key: 'charmed',
    label: 'Charmed',
    tone: 'debuff',
    icon: 'heart',
    description: 'Cannot attack the charmer.',
  },
  {
    key: 'deafened',
    label: 'Deafened',
    tone: 'debuff',
    icon: 'ear-slash',
    description: 'Cannot hear.',
  },
  {
    key: 'frightened',
    label: 'Frightened',
    tone: 'debuff',
    icon: 'ghost',
    description: 'Disadvantage while the source is in sight.',
  },
  {
    key: 'grappled',
    label: 'Grappled',
    tone: 'debuff',
    icon: 'hand-grabbing',
    description: 'Speed becomes 0.',
  },
  {
    key: 'incapacitated',
    label: 'Incapacitated',
    tone: 'debuff',
    icon: 'prohibit',
    description: 'No actions or reactions.',
  },
  {
    key: 'invisible',
    label: 'Invisible',
    tone: 'buff',
    icon: 'eye-closed',
    description: 'Unseen without magic; attacks have advantage.',
  },
  {
    key: 'paralysed',
    label: 'Paralysed',
    tone: 'danger',
    icon: 'lightning-slash',
    description: 'Incapacitated; hits within 5 ft are critical.',
  },
  {
    key: 'petrified',
    label: 'Petrified',
    tone: 'danger',
    icon: 'cube',
    description: 'Transformed to stone; incapacitated.',
  },
  {
    key: 'poisoned',
    label: 'Poisoned',
    tone: 'debuff',
    icon: 'flask',
    description: 'Disadvantage on attacks and ability checks.',
  },
  {
    key: 'prone',
    label: 'Prone',
    tone: 'debuff',
    icon: 'arrow-down',
    description: 'Disadvantage on attacks; melee against has advantage.',
  },
  {
    key: 'restrained',
    label: 'Restrained',
    tone: 'debuff',
    icon: 'lock-simple',
    description: 'Speed 0; disadvantage on attacks and Dex saves.',
  },
  {
    key: 'stunned',
    label: 'Stunned',
    tone: 'danger',
    icon: 'star',
    description: 'Incapacitated; auto-fails Str and Dex saves.',
  },
  {
    key: 'unconscious',
    label: 'Unconscious',
    tone: 'danger',
    icon: 'heartbeat',
    description: 'Incapacitated, prone and unaware.',
  },
  {
    key: 'exhaustion',
    label: 'Exhaustion',
    tone: 'debuff',
    icon: 'battery-low',
    description: 'Cumulative penalty to d20 tests.',
  },
  {
    key: 'concentration',
    label: 'Concentrating',
    tone: 'concentration',
    icon: 'brain',
    description: 'Maintaining a spell; damage forces a save.',
  },
  {
    key: 'bless',
    label: 'Bless',
    tone: 'buff',
    icon: 'sparkle',
    description: 'Add 1d4 to attacks and saving throws.',
  },
  {
    key: 'hex',
    label: 'Hex',
    tone: 'concentration',
    icon: 'brain',
    description: 'Extra necrotic damage; disadvantage on one ability.',
  },
] as const;
