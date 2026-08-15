/**
 * D&D 5e character sheet content and level-up rules.
 *
 * Reaches the sheet as `SheetSection` and `SheetContent`, so the screen renders attacks,
 * skills and spells without knowing that any of those are D&D concepts.
 */
import type {
  BuilderIssue,
  BuilderStepForm,
  LevelUpChange,
  LevelUpOutcome,
  RollableEntry,
  SheetContent,
  SheetSection,
  ValueEntry,
} from '../Ruleset.ts';
import type { Character, ResourcePool } from '../../types.ts';
import { ABILITY_LABELS, ABILITY_NAMES, abilityModifier, proficiencyBonus } from './constants.ts';
import { CLASSES, FIGHTING_STYLES, SPELLS, type ClassDefinition } from './builder.ts';

interface Dnd5eData {
  classKey?: string;
  className?: string;
  subclass?: string;
  species?: string;
  background?: string;
  armour?: string;
  shield?: boolean;
  fightingStyle?: string;
  skills?: string[];
  cantrips?: string[];
  spells?: string[];
  equipment?: string;
  appearance?: string;
  backstory?: string;
}

const data = (character: Character): Dnd5eData => character.systemData as Dnd5eData;

const classOf = (character: Character): ClassDefinition | undefined =>
  CLASSES.find((entry) => entry.key === data(character).classKey);

function modifier(character: Character, ability: string): number {
  const attribute = character.attributes.find((entry) => entry.key === ability);
  return attribute ? abilityModifier(attribute.value) : 0;
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

/** The 18 skills and the ability each keys off. */
const SKILLS: { name: string; ability: string }[] = [
  { name: 'Acrobatics', ability: 'dex' },
  { name: 'Animal Handling', ability: 'wis' },
  { name: 'Arcana', ability: 'int' },
  { name: 'Athletics', ability: 'str' },
  { name: 'Deception', ability: 'cha' },
  { name: 'History', ability: 'int' },
  { name: 'Insight', ability: 'wis' },
  { name: 'Intimidation', ability: 'cha' },
  { name: 'Investigation', ability: 'int' },
  { name: 'Medicine', ability: 'wis' },
  { name: 'Nature', ability: 'int' },
  { name: 'Perception', ability: 'wis' },
  { name: 'Performance', ability: 'cha' },
  { name: 'Persuasion', ability: 'cha' },
  { name: 'Religion', ability: 'int' },
  { name: 'Sleight of Hand', ability: 'dex' },
  { name: 'Stealth', ability: 'dex' },
  { name: 'Survival', ability: 'wis' },
];

/** Weapons a class starts with, so attacks are real rows rather than a placeholder. */
const CLASS_WEAPONS: Record<
  string,
  { name: string; ability: string; damage: string; type: string; range: string; tags?: string[] }[]
> = {
  fighter: [
    {
      name: 'Longsword',
      ability: 'str',
      damage: '1d8',
      type: 'slashing',
      range: 'Reach 5 ft',
      tags: ['Versatile'],
    },
    {
      name: 'Longsword — two-handed',
      ability: 'str',
      damage: '1d10',
      type: 'slashing',
      range: 'Reach 5 ft',
    },
    { name: 'Longbow', ability: 'dex', damage: '1d8', type: 'piercing', range: '150 / 600 ft' },
  ],
  barbarian: [
    { name: 'Greataxe', ability: 'str', damage: '1d12', type: 'slashing', range: 'Reach 5 ft' },
    {
      name: 'Handaxe',
      ability: 'str',
      damage: '1d6',
      type: 'slashing',
      range: '20 / 60 ft',
      tags: ['Thrown'],
    },
  ],
  rogue: [
    {
      name: 'Rapier',
      ability: 'dex',
      damage: '1d8',
      type: 'piercing',
      range: 'Reach 5 ft',
      tags: ['Finesse'],
    },
    { name: 'Shortbow', ability: 'dex', damage: '1d6', type: 'piercing', range: '80 / 320 ft' },
    {
      name: 'Dagger',
      ability: 'dex',
      damage: '1d4',
      type: 'piercing',
      range: '20 / 60 ft',
      tags: ['Finesse', 'Thrown'],
    },
  ],
  cleric: [
    { name: 'Mace', ability: 'str', damage: '1d6', type: 'bludgeoning', range: 'Reach 5 ft' },
  ],
  wizard: [
    {
      name: 'Quarterstaff',
      ability: 'str',
      damage: '1d6',
      type: 'bludgeoning',
      range: 'Reach 5 ft',
      tags: ['Versatile'],
    },
  ],
  ranger: [
    { name: 'Longbow', ability: 'dex', damage: '1d8', type: 'piercing', range: '150 / 600 ft' },
    {
      name: 'Shortsword',
      ability: 'dex',
      damage: '1d6',
      type: 'piercing',
      range: 'Reach 5 ft',
      tags: ['Finesse'],
    },
  ],
  warlock: [
    {
      name: 'Dagger',
      ability: 'dex',
      damage: '1d4',
      type: 'piercing',
      range: '20 / 60 ft',
      tags: ['Finesse'],
    },
  ],
  druid: [
    {
      name: 'Quarterstaff',
      ability: 'str',
      damage: '1d6',
      type: 'bludgeoning',
      range: 'Reach 5 ft',
    },
  ],
};

/** Class features by level, so Features is real content rather than a stub. */
const CLASS_FEATURES: Record<string, { level: number; name: string; text: string }[]> = {
  fighter: [
    {
      level: 1,
      name: 'Second Wind',
      text: 'A bonus action to regain 1d10 + your Fighter level hit points, twice per long rest.',
    },
    {
      level: 5,
      name: 'Extra Attack',
      text: 'Attack twice instead of once whenever you take the Attack action on your turn.',
    },
    {
      level: 3,
      name: 'Combat Superiority',
      text: 'Superiority dice spent on manoeuvres, recovered on a short rest. The sheet tracks the pool and offers each manoeuvre as its own rollable action.',
    },
    {
      level: 7,
      name: 'Know Your Enemy',
      text: 'Study a creature for one minute to learn two of its capabilities.',
    },
  ],
  rogue: [
    {
      level: 1,
      name: 'Sneak Attack',
      text: 'Once per turn, add extra damage to an attack when you have advantage or an ally is adjacent.',
    },
    { level: 2, name: 'Cunning Action', text: 'Dash, Disengage or Hide as a bonus action.' },
    {
      level: 3,
      name: 'Assassinate',
      text: 'Advantage against any creature that has not taken a turn, and a hit against a surprised creature is a critical.',
    },
  ],
  cleric: [
    {
      level: 1,
      name: 'Divine Order',
      text: 'Protector or Thaumaturge — a martial or a magical calling.',
    },
    {
      level: 2,
      name: 'Channel Divinity',
      text: 'Turn Undead or a domain effect, recovered on a short rest.',
    },
  ],
  wizard: [
    {
      level: 1,
      name: 'Arcane Recovery',
      text: 'Recover expended spell slots on a short rest, once per day.',
    },
  ],
  warlock: [
    {
      level: 1,
      name: 'Eldritch Invocations',
      text: 'Permanent magical alterations chosen from your pact.',
    },
  ],
  druid: [
    {
      level: 2,
      name: 'Wild Shape',
      text: 'Assume the form of a beast you have seen, twice per short rest.',
    },
  ],
  ranger: [
    {
      level: 1,
      name: 'Favoured Enemy',
      text: "Hunter's Mark is always prepared and castable without a slot a number of times per day.",
    },
  ],
  barbarian: [
    { level: 1, name: 'Rage', text: 'Damage resistance and bonus melee damage while raging.' },
  ],
};

const PACKS: Record<string, string[]> = {
  dungeoneer: [
    'Rope, 50 ft',
    'Torch ×10',
    'Rations ×10',
    'Crowbar',
    'Tinderbox',
    'Hammer',
    'Piton ×10',
  ],
  explorer: [
    'Bedroll',
    'Mess kit',
    'Rations ×10',
    'Waterskin',
    'Rope, 50 ft',
    'Torch ×10',
    'Tinderbox',
  ],
  scholar: ['Book of lore', 'Ink and pen', 'Parchment ×10', 'Bag of sand', 'Small knife', 'Lamp'],
  priest: ['Holy water', 'Incense ×2', 'Vestments', 'Rations ×2', 'Tinderbox', 'Alms box'],
};

/* ── Sections ───────────────────────────────────────────────────────────────── */

function isCaster(character: Character): boolean {
  const key = data(character).classKey;
  return key !== undefined && SPELLS[key] !== undefined;
}

function allSpells(character: Character): RollableEntry[] {
  const info = data(character);
  const list = info.classKey ? SPELLS[info.classKey] : undefined;
  if (!list) return [];

  const spellMod = spellcastingModifier(character);
  const attack = signed(spellMod + proficiencyBonus(character.level));

  const cantrips: RollableEntry[] = list.cantrips.map((spell) => ({
    key: spell.value,
    name: spell.label,
    tier: 'Cantrip',
    description: spell.description,
    prepared: true,
    meta: ['At will'],
    rolls: [{ label: 'Attack', expression: `1d20 ${attack}` }],
  }));

  const first: RollableEntry[] = list.first.map((spell) => ({
    key: spell.value,
    name: spell.label,
    tier: 'Level 1',
    description: spell.description,
    // Everything known stays visible; unprepared reads as unprepared, never as missing.
    prepared: (info.spells ?? []).includes(spell.value),
    meta: ['1 action'],
  }));

  // Cantrips sort first, as the design specifies.
  return [...cantrips, ...first];
}

function spellcastingModifier(character: Character): number {
  const key = data(character).classKey;
  const ability =
    key === 'cleric' || key === 'druid' || key === 'ranger'
      ? 'wis'
      : key === 'wizard'
        ? 'int'
        : 'cha';
  return modifier(character, ability);
}

export function sheetSections(character: Character): SheetSection[] {
  const info = data(character);
  const klass = classOf(character);

  const sections: SheetSection[] = [{ id: 'actions', label: 'Actions', privacyKey: 'actions' }];

  if (isCaster(character)) {
    sections.push({
      id: 'spells',
      label: 'Spells',
      count: allSpells(character).length,
      privacyKey: 'actions',
    });
  }

  sections.push(
    { id: 'skills', label: 'Skills & saves', privacyKey: 'abilities' },
    {
      id: 'items',
      label: 'Items',
      count: (PACKS[info.equipment ?? 'dungeoneer'] ?? []).length + (klass ? 2 : 0),
      privacyKey: 'inventory',
    },
    {
      id: 'features',
      label: 'Features',
      count: (CLASS_FEATURES[info.classKey ?? ''] ?? []).filter(
        (feature) => feature.level <= character.level,
      ).length,
      privacyKey: 'features',
    },
    { id: 'background', label: 'Background', privacyKey: 'background' },
  );

  return sections;
}

/* ── Content ────────────────────────────────────────────────────────────────── */

function actions(character: Character): RollableEntry[] {
  const info = data(character);
  const klass = classOf(character);
  const prof = proficiencyBonus(character.level);

  const weapons = CLASS_WEAPONS[info.classKey ?? ''] ?? [];
  const rows: RollableEntry[] = weapons.map((weapon) => {
    const mod = modifier(character, weapon.ability);
    const style = info.fightingStyle;
    // Archery adds +2 to hit with ranged weapons — the kind of dependency the sheet must
    // apply so the expression a player taps is already correct.
    const archery = style === 'archery' && weapon.range.includes('/') ? 2 : 0;
    const duelling = style === 'duelling' && weapon.range.startsWith('Reach') ? 2 : 0;

    return {
      key: weapon.name,
      name: weapon.name,
      meta: [`${weapon.damage} ${signed(mod + duelling)} ${weapon.type}`, weapon.range],
      tags: weapon.tags,
      rolls: [
        { label: 'Attack', expression: `1d20 ${signed(mod + prof + archery)}` },
        { label: 'Damage', expression: `${weapon.damage} ${signed(mod + duelling)}` },
      ],
    };
  });

  if (info.classKey === 'fighter') {
    rows.push({
      key: 'second-wind',
      name: 'Second Wind',
      meta: [`1d10 +${character.level} healing`],
      tags: ['Bonus action', '2 per long rest'],
      rolls: [{ label: 'Heal', expression: `1d10 +${character.level}` }],
    });
  }

  if (klass) {
    rows.push({
      key: 'unarmed',
      name: 'Unarmed strike',
      meta: [`1 ${signed(modifier(character, 'str'))} bludgeoning`, 'Reach 5 ft'],
      rolls: [{ label: 'Attack', expression: `1d20 ${signed(modifier(character, 'str') + prof)}` }],
    });
  }

  return rows;
}

function skillValues(character: Character): ValueEntry[] {
  const info = data(character);
  const prof = proficiencyBonus(character.level);
  const trained = new Set(info.skills ?? []);

  return SKILLS.map((skill) => {
    const base = modifier(character, skill.ability);
    const total = base + (trained.has(skill.name) ? prof : 0);
    return {
      key: skill.name,
      label: skill.name,
      value: signed(total),
      proficient: trained.has(skill.name),
      expression: `1d20 ${signed(total)}`,
    };
  });
}

function saveValues(character: Character): ValueEntry[] {
  const klass = classOf(character);
  const prof = proficiencyBonus(character.level);
  const proficientSaves = new Set(klass?.savingThrows ?? []);

  return character.attributes.map((attribute) => {
    const name = ABILITY_NAMES[attribute.key as keyof typeof ABILITY_NAMES] ?? attribute.label;
    const base = abilityModifier(attribute.value);
    const total = base + (proficientSaves.has(name) ? prof : 0);
    return {
      key: attribute.key,
      label: name,
      value: signed(total),
      proficient: proficientSaves.has(name),
      expression: `1d20 ${signed(total)}`,
    };
  });
}

function spellResources(character: Character): ResourcePool[] {
  return character.resources.filter((resource) => resource.tier !== undefined);
}

export function sheetContent(character: Character, sectionId: string): SheetContent {
  const info = data(character);
  const klass = classOf(character);

  switch (sectionId) {
    case 'actions':
      return { rollables: actions(character) };

    case 'spells':
      return { rollables: allSpells(character), resources: spellResources(character) };

    case 'skills':
      // Saves sit beside the abilities that produce them, which is what the design says
      // desktop width buys — simultaneity rather than extra features.
      return { values: [...saveValues(character), ...skillValues(character)] };

    case 'items': {
      const pack = PACKS[info.equipment ?? 'dungeoneer'] ?? [];
      const carried = [
        ...(klass && klass.startingArmour !== 'none'
          ? [klass.startingArmour.replaceAll('-', ' ')]
          : []),
        ...(klass?.startingShield ? ['Shield'] : []),
        ...(CLASS_WEAPONS[info.classKey ?? ''] ?? []).map((weapon) => weapon.name),
        ...pack,
      ];
      return {
        values: carried.map((item, index) => ({
          key: `${item}-${index}`,
          label: item,
          value: '',
        })),
      };
    }

    case 'features': {
      const features = (CLASS_FEATURES[info.classKey ?? ''] ?? [])
        .filter((feature) => feature.level <= character.level)
        .toSorted((a, b) => a.level - b.level);

      const style = FIGHTING_STYLES.find((entry) => entry.value === info.fightingStyle);
      return {
        prose: [
          ...(style
            ? [{ name: `Fighting Style — ${style.label}`, text: style.description ?? '' }]
            : []),
          ...features.map((feature) => ({
            name: `${feature.name} (level ${feature.level})`,
            text: feature.text,
          })),
        ],
      };
    }

    case 'background':
      return {
        prose: [
          { name: 'Species', text: info.species ?? '—' },
          { name: 'Background', text: info.background ?? '—' },
          ...(info.appearance ? [{ name: 'Appearance', text: info.appearance }] : []),
          ...(info.backstory ? [{ name: 'Backstory', text: info.backstory }] : []),
        ],
      };

    default:
      return {};
  }
}

/* ── Level up ───────────────────────────────────────────────────────────────── */

const MANOEUVRES = [
  {
    value: 'precision',
    label: 'Precision Attack',
    description: 'Spend a superiority die to add 1d8 to an attack roll',
  },
  {
    value: 'trip',
    label: 'Trip Attack',
    description: 'Add a superiority die to damage and knock the target prone',
  },
  {
    value: 'riposte',
    label: 'Riposte',
    description: 'React to a miss with an attack plus a superiority die',
  },
  {
    value: 'menacing',
    label: 'Menacing Attack',
    description: 'Add a superiority die and frighten the target',
  },
];

/** Hit points gained: roll the class die, or take the fixed average. */
function hitPointGain(
  character: Character,
  choices: Readonly<Record<string, unknown>>,
): {
  gain: number;
  method: 'rolled' | 'average';
  roll?: number;
} {
  const klass = classOf(character);
  const die = klass?.hitDie ?? 8;
  const con = modifier(character, 'con');
  const method = choices.hitPointMethod === 'roll' ? 'rolled' : 'average';

  if (method === 'rolled') {
    const roll =
      typeof choices.hitPointRoll === 'number' ? choices.hitPointRoll : Math.ceil(die / 2) + 1;
    return { gain: roll + con, method, roll };
  }
  // The fixed average is (die / 2) + 1, which is what a player takes to avoid a bad roll.
  return { gain: die / 2 + 1 + con, method };
}

export function levelUpStepForm(
  character: Character,
  toLevel: number,
  stepId: string,
  // Present for symmetry with the builder and because a later step may depend on an
  // earlier answer; nothing at these levels does yet.
  _choices: Readonly<Record<string, unknown>>,
): BuilderStepForm | null {
  const info = data(character);
  const klass = classOf(character);

  switch (stepId) {
    case 'hit-points': {
      const die = klass?.hitDie ?? 8;
      return {
        stepId,
        title: 'Hit points',
        intro: `Advancing to level ${toLevel} adds a hit die. Take the fixed average, or roll and accept what you get.`,
        fields: [
          {
            key: 'hitPointMethod',
            label: 'How do you want to gain hit points?',
            kind: 'single-choice',
            required: true,
            options: [
              {
                value: 'average',
                label: `Take the average (${die / 2 + 1})`,
                description: 'Reliable, and never worse than half',
                recommended: true,
              },
              {
                value: 'roll',
                label: `Roll 1d${die}`,
                description: 'Could be better, could be worse',
              },
            ],
          },
        ],
      };
    }

    case 'subclass':
      return {
        stepId,
        title: 'Subclass',
        intro: `${klass?.label ?? 'Your class'} chooses its subclass at level ${klass?.subclassLevel ?? 3}.`,
        fields: [
          {
            key: 'subclass',
            label: 'Subclass',
            kind: 'single-choice',
            required: true,
            options: subclassOptions(info.classKey),
          },
        ],
      };

    case 'asi':
      return {
        stepId,
        title: 'Ability score improvement',
        intro: 'Raise one ability by 2, or two abilities by 1 each.',
        fields: [
          {
            key: 'asi',
            label: 'Improve',
            kind: 'multi-choice',
            required: true,
            choose: 2,
            columns: 2,
            help: 'Pick the same ability twice to raise it by 2.',
            options: character.attributes.map((attribute) => ({
              value: attribute.key,
              label: ABILITY_NAMES[attribute.key as keyof typeof ABILITY_NAMES] ?? attribute.label,
              description: `Currently ${attribute.value}`,
            })),
          },
        ],
      };

    case 'manoeuvre':
      return {
        stepId,
        title: 'Manoeuvre',
        intro: 'Battle Masters learn a new manoeuvre as they advance.',
        fields: [
          {
            key: 'manoeuvre',
            label: 'New manoeuvre',
            kind: 'single-choice',
            required: true,
            options: MANOEUVRES,
          },
        ],
      };

    case 'spells': {
      const list = info.classKey ? SPELLS[info.classKey] : undefined;
      if (!list) return null;
      return {
        stepId,
        title: 'Spells',
        intro: 'One new spell becomes available at this level.',
        fields: [
          {
            key: 'newSpell',
            label: 'New spell',
            kind: 'single-choice',
            required: true,
            options: list.first,
          },
        ],
      };
    }

    case 'review':
      return { stepId, title: 'Review changes', review: true, fields: [] };

    default:
      return null;
  }
}

function subclassOptions(classKey: string | undefined) {
  const table: Record<string, { value: string; label: string; description: string }[]> = {
    fighter: [
      {
        value: 'Battle Master',
        label: 'Battle Master',
        description: 'Superiority dice and manoeuvres',
      },
      { value: 'Champion', label: 'Champion', description: 'Improved critical hits' },
    ],
    rogue: [
      {
        value: 'Assassin',
        label: 'Assassin',
        description: 'Advantage and criticals against the unready',
      },
      { value: 'Thief', label: 'Thief', description: 'Fast hands and second-storey work' },
    ],
    cleric: [
      { value: 'Life Domain', label: 'Life Domain', description: 'Stronger healing' },
      { value: 'Light Domain', label: 'Light Domain', description: 'Radiance and fire' },
    ],
    wizard: [
      { value: 'Evoker', label: 'Evoker', description: 'Sculpted, more powerful damage spells' },
      { value: 'Abjurer', label: 'Abjurer', description: 'A renewing arcane ward' },
    ],
  };
  return (
    table[classKey ?? ''] ?? [
      { value: 'Default', label: 'Default', description: 'Your class specialism' },
    ]
  );
}

export function validateLevelUpStep(
  character: Character,
  toLevel: number,
  stepId: string,
  choices: Readonly<Record<string, unknown>>,
): BuilderIssue[] {
  const form = levelUpStepForm(character, toLevel, stepId, choices);
  if (!form) return [];

  const issues: BuilderIssue[] = [];
  for (const field of form.fields) {
    if (!field.required) continue;
    const value = (choices as Record<string, unknown>)[field.key];

    if (field.kind === 'single-choice' && typeof value !== 'string') {
      issues.push({
        fieldKey: field.key,
        message: `Choose a ${field.label.toLowerCase()} to continue`,
      });
    }
    if (field.kind === 'multi-choice') {
      const picked = Array.isArray(value) ? value.length : 0;
      const want = field.choose ?? 1;
      if (picked !== want) {
        issues.push({
          fieldKey: field.key,
          message: `Choose ${want - picked} more`,
        });
      }
    }
  }
  return issues;
}

/**
 * What this level-up does, split into the player's decisions and the rules'.
 *
 * The design calls this split the single most useful thing the screen can do for a player
 * who does not know the rules, so it is computed rather than described in prose.
 */
export function levelUpChanges(
  character: Character,
  toLevel: number,
  choices: Readonly<Record<string, unknown>>,
): LevelUpOutcome {
  const info = data(character);
  const klass = classOf(character);
  const hp = hitPointGain(character, choices);

  const chosen: LevelUpChange[] = [];
  const automatic: LevelUpChange[] = [];

  if (choices.manoeuvre) {
    const manoeuvre = MANOEUVRES.find((entry) => entry.value === choices.manoeuvre);
    if (manoeuvre) {
      chosen.push({
        key: 'manoeuvre',
        summary: manoeuvre.label,
        detail: `New Battle Master manoeuvre · ${manoeuvre.description}`,
      });
    }
  }

  if (choices.subclass) {
    chosen.push({
      key: 'subclass',
      summary: String(choices.subclass),
      detail: `${klass?.label ?? 'Class'} specialism, chosen at level ${klass?.subclassLevel ?? 3}`,
    });
  }

  if (Array.isArray(choices.asi)) {
    const picks = choices.asi as string[];
    chosen.push({
      key: 'asi',
      summary: 'Ability score improvement',
      detail: picks
        .map((key) => ABILITY_NAMES[key as keyof typeof ABILITY_NAMES] ?? key)
        .join(' and '),
      badge: '+2 total',
    });
  }

  if (choices.newSpell) {
    const list = info.classKey ? SPELLS[info.classKey] : undefined;
    const spell = list?.first.find((entry) => entry.value === choices.newSpell);
    if (spell) {
      chosen.push({ key: 'spell', summary: spell.label, detail: spell.description, isNew: true });
    }
  }

  chosen.push({
    key: 'hit-points',
    summary: hp.method === 'rolled' ? 'Hit points: rolled' : 'Hit points: average taken',
    detail:
      hp.method === 'rolled'
        ? `You rolled 1d${klass?.hitDie ?? 8} and got ${hp.roll} · average would have been ${(klass?.hitDie ?? 8) / 2 + 1}`
        : `The fixed average for a d${klass?.hitDie ?? 8}`,
    badge: `+${hp.gain} total`,
  });

  /* ── What the rules did ── */

  automatic.push({
    key: 'hp-total',
    summary: `Hit points ${character.health.max} → ${character.health.max + hp.gain}`,
    detail: `${hp.method === 'rolled' ? hp.roll : (klass?.hitDie ?? 8) / 2 + 1} + ${modifier(character, 'con')} Constitution`,
    badge: `+${hp.gain}`,
  });

  const newFeature = (CLASS_FEATURES[info.classKey ?? ''] ?? []).find(
    (feature) => feature.level === toLevel,
  );
  if (newFeature) {
    automatic.push({
      key: `feature-${newFeature.name}`,
      summary: newFeature.name,
      detail: `${klass?.label ?? 'Class'} ${toLevel} feature · ${newFeature.text}`,
      badge: 'New',
      isNew: true,
    });
  }

  // Battle Master superiority dice grow at 7th and 15th level.
  if (info.subclass === 'Battle Master' && (toLevel === 7 || toLevel === 15)) {
    const before = toLevel === 7 ? 4 : 5;
    automatic.push({
      key: 'superiority',
      summary: `Superiority dice ${before} → ${before + 1}`,
      detail: 'Battle Master progression · still 1d8 each',
      badge: '+1',
    });
  }

  const oldProf = proficiencyBonus(character.level);
  const newProf = proficiencyBonus(toLevel);
  automatic.push({
    key: 'proficiency',
    summary:
      newProf > oldProf
        ? `Proficiency bonus ${signed(oldProf)} → ${signed(newProf)}`
        : `Proficiency bonus unchanged`,
    detail:
      newProf > oldProf
        ? 'Every trained skill, save and attack improves'
        : `Still ${signed(oldProf)} — the next increase is at level ${nextProficiencyLevel(toLevel)}`,
    badge: newProf > oldProf ? `+${newProf - oldProf}` : 'No change',
  });

  return { chosen, automatic };
}

function nextProficiencyLevel(level: number): number {
  const thresholds = [5, 9, 13, 17];
  return thresholds.find((threshold) => threshold > level) ?? 20;
}

export function applyLevelUp(
  character: Character,
  toLevel: number,
  choices: Readonly<Record<string, unknown>>,
): Character {
  const hp = hitPointGain(character, choices);
  const info = data(character);

  const attributes = character.attributes.map((attribute) => {
    const picks = Array.isArray(choices.asi) ? (choices.asi as string[]) : [];
    const bumps = picks.filter((key) => key === attribute.key).length;
    const value = attribute.value + bumps;
    return { ...attribute, value, modifier: abilityModifier(value) };
  });

  return {
    ...character,
    level: toLevel,
    attributes,
    health: {
      ...character.health,
      max: character.health.max + hp.gain,
      // A level-up heals nothing by itself; the maximum rises and the current follows it
      // by the same amount, which is what every table does in practice.
      current: character.health.current + hp.gain,
    },
    pendingLevelUp: false,
    subtitle: character.subtitle.replace(/\d+$/, String(toLevel)),
    systemData: {
      ...character.systemData,
      subclass: (choices.subclass as string | undefined) ?? info.subclass,
      manoeuvres: [
        ...(((info as Record<string, unknown>).manoeuvres as string[] | undefined) ?? []),
        ...(choices.manoeuvre ? [String(choices.manoeuvre)] : []),
      ],
      spells: [...(info.spells ?? []), ...(choices.newSpell ? [String(choices.newSpell)] : [])],
    },
  };
}

export { ABILITY_LABELS };
