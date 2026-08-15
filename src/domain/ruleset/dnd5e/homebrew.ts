/**
 * D&D 5e rules for editing a creature.
 *
 * The editor is generic — it renders grouped fields and a preview. Everything that decides
 * what a valid creature is, what its difficulty works out to, and how a hit-dice
 * expression becomes an average lives here.
 */
import type { BuilderIssue } from '../Ruleset.ts';
import type { DerivedValue, Monster } from '../../types.ts';
import { abilityModifier } from './constants.ts';

/** Reads "2d6 + 2" into an average. Returns null rather than guessing at nonsense. */
export function hitPointsFromDice(expression: string): number | null {
  const match = /^\s*(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i.exec(expression);
  if (!match) return null;

  const count = Number(match[1]);
  const sides = Number(match[2]);
  const sign = match[3] === '-' ? -1 : 1;
  const modifier = match[4] ? sign * Number(match[4]) : 0;
  if (count < 1 || sides < 2) return null;

  // The published average for a die is (sides + 1) / 2, taken across the whole group.
  return Math.max(1, Math.floor((count * (sides + 1)) / 2) + modifier);
}

const MAX_HIT_POINTS = 400;
const MIN_ABILITY = 1;
const MAX_ABILITY = 30;

function armourClassOf(monster: Monster): number {
  return Number(monster.derived.find((value) => value.key === 'ac')?.value);
}

export function validateMonster(monster: Monster): BuilderIssue[] {
  const issues: BuilderIssue[] = [];

  if (monster.name.trim().length === 0) {
    issues.push({ fieldKey: 'name', message: 'Give this creature a name' });
  }

  const armourClass = armourClassOf(monster);
  if (!Number.isFinite(armourClass) || armourClass < 1 || armourClass > 30) {
    issues.push({ fieldKey: 'ac', message: 'Enter an armour class between 1 and 30' });
  }

  if (monster.health.max < 1 || monster.health.max > MAX_HIT_POINTS) {
    issues.push({ fieldKey: 'hp', message: `Enter a value between 1 and ${MAX_HIT_POINTS}` });
  }

  for (const attribute of monster.attributes) {
    if (attribute.value < MIN_ABILITY || attribute.value > MAX_ABILITY) {
      issues.push({
        fieldKey: `ability-${attribute.key}`,
        message: `${attribute.label} must be between ${MIN_ABILITY} and ${MAX_ABILITY}`,
      });
    }
  }

  const hasAction = monster.actionGroups.some((group) => group.entries.length > 0);
  if (!hasAction) {
    issues.push({ fieldKey: 'actions', message: 'Give this creature at least one action' });
  }

  return issues;
}

const XP_BY_RANK: Record<number, number> = {
  0: 10,
  0.125: 25,
  0.25: 50,
  0.5: 100,
  1: 200,
  2: 450,
  3: 700,
  4: 1100,
  5: 1800,
  6: 2300,
  7: 2900,
  8: 3900,
  9: 5000,
  10: 5900,
};

/** Hit-point ceilings for each defensive challenge band. */
const HP_BANDS: [number, number][] = [
  [6, 0],
  [35, 0.125],
  [49, 0.25],
  [70, 0.5],
  [85, 1],
  [100, 2],
  [115, 3],
  [130, 4],
  [145, 5],
  [160, 6],
  [175, 7],
  [190, 8],
  [205, 9],
  [220, 10],
  [235, 11],
  [250, 12],
  [265, 13],
  [280, 14],
  [295, 15],
  [310, 16],
  [325, 17],
];

function rankLabel(rank: number): string {
  if (rank >= 1) return `CR ${rank}`;
  if (rank === 0.5) return 'CR 1/2';
  if (rank === 0.25) return 'CR 1/4';
  if (rank === 0.125) return 'CR 1/8';
  return 'CR 0';
}

/**
 * A rough difficulty estimate from defence and offence.
 *
 * ponytail: the published maths scores defence and offence against separate tables and
 * averages the two. This does the defensive half properly, nudges it by armour class and
 * best attack bonus, and is labelled "estimated" everywhere it appears — a DM can always
 * set the challenge by hand. Replace with the full two-table calculation if homebrew
 * balance becomes a feature rather than a convenience.
 */
export function estimateChallenge(monster: Monster): {
  rank: number;
  label: string;
  detail: string;
} {
  const hp = monster.health.max;
  const armourClass = armourClassOf(monster) || 10;

  let rank = HP_BANDS.find(([ceiling]) => hp <= ceiling)?.[1] ?? 18;

  // Armour that is unusually good or bad for the band moves the estimate.
  const expectedArmour = 13 + Math.floor(rank / 3);
  rank = Math.max(0, rank + Math.round((armourClass - expectedArmour) / 2));

  const bonuses = monster.actionGroups
    .flatMap((group) => group.entries)
    .map((entry) => Number(entry.attackBonus?.replace('+', '')))
    .filter((value) => Number.isFinite(value));

  if (bonuses.length > 0) {
    const expectedAttack = 3 + Math.floor(rank / 2);
    rank = Math.max(0, rank + Math.round((Math.max(...bonuses) - expectedAttack) / 3));
  }

  const xp = XP_BY_RANK[rank] ?? rank * 1000;

  return {
    rank,
    label: rankLabel(rank),
    detail: `${xp.toLocaleString()} XP · from ${hp} hit points and armour class ${armourClass}`,
  };
}

/** Recomputes what the rules own, so the preview can never disagree with the form. */
export function normaliseMonster(monster: Monster): Monster {
  const size = monster.facets.size?.[0] ?? 'Medium';
  const type = monster.facets.type?.[0] ?? 'Humanoid';
  const alignment = (monster.systemData as { alignment?: string }).alignment ?? 'unaligned';
  const estimate = estimateChallenge(monster);

  // Whatever the DM stated for speed, senses, languages and the rest is kept; only the
  // values the rules own get rebuilt.
  const stated = monster.derived.filter((value) => !['ac', 'hp', 'challenge'].includes(value.key));
  const armourClass = monster.derived.find((value) => value.key === 'ac');

  const derived: DerivedValue[] = [
    armourClass ?? { key: 'ac', label: 'Armour class', value: 10 },
    { key: 'hp', label: 'Hit points', value: monster.health.max },
    {
      key: 'challenge',
      label: 'Challenge',
      value: monster.challengeLabel || estimate.label,
      explanation: estimate.detail,
    },
    ...stated,
  ];

  return {
    ...monster,
    subtitle: `${size} ${type.toLowerCase()}, ${alignment}`,
    attributes: monster.attributes.map((attribute) => ({
      ...attribute,
      modifier: abilityModifier(attribute.value),
    })),
    // A creature that is not in a fight is at full health by definition.
    health: { ...monster.health, current: monster.health.max },
    derived,
  };
}
