/**
 * D&D 5e encounter difficulty.
 *
 * The published method: sum each creature's XP by challenge rating, multiply by a factor
 * that grows with the number of creatures, and compare the result against thresholds
 * derived from the party's levels. All four numbers are stated to the DM rather than
 * collapsed into one word, because a DM who cannot see the working cannot argue with it.
 */
import type { EncounterCreature, EncounterDifficulty } from '../Ruleset.ts';
import type { Character } from '../../types.ts';

/** Experience awarded per challenge rank. */
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
  11: 7200,
  12: 8400,
  13: 10_000,
  14: 11_500,
  15: 13_000,
  16: 15_000,
  17: 18_000,
  18: 20_000,
  19: 22_000,
  20: 25_000,
  21: 33_000,
  22: 41_000,
  23: 50_000,
  24: 62_000,
  25: 75_000,
  26: 90_000,
  27: 105_000,
  28: 120_000,
  29: 135_000,
  30: 155_000,
};

/** Per-character thresholds by level: easy, medium, hard, deadly. */
const THRESHOLDS: Record<number, [number, number, number, number]> = {
  1: [25, 50, 75, 100],
  2: [50, 100, 150, 200],
  3: [75, 150, 225, 400],
  4: [125, 250, 375, 500],
  5: [250, 500, 750, 1100],
  6: [300, 600, 900, 1400],
  7: [350, 750, 1100, 1700],
  8: [450, 900, 1400, 2100],
  9: [550, 1100, 1600, 2400],
  10: [600, 1200, 1900, 2800],
  11: [800, 1600, 2400, 3600],
  12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100],
  14: [1250, 2500, 3800, 5700],
  15: [1400, 2800, 4300, 6400],
  16: [1600, 3200, 4800, 7200],
  17: [2000, 3900, 5900, 8800],
  18: [2100, 4200, 6300, 9500],
  19: [2400, 4900, 7300, 10_900],
  20: [2800, 5700, 8500, 12_700],
};

/** More creatures hit harder than their XP suggests. Ceilings are inclusive. */
const MULTIPLIERS: [number, number][] = [
  [1, 1],
  [2, 1.5],
  [6, 2],
  [10, 2.5],
  [14, 3],
  [Number.POSITIVE_INFINITY, 4],
];

function xpFor(rank: number): number {
  const known = XP_BY_RANK[rank];
  if (known !== undefined) return known;

  // An out-of-range or homebrew rank falls back to the nearest published one rather than
  // dropping the creature out of the sum, which would understate the fight.
  const ranks = Object.keys(XP_BY_RANK).map(Number);
  const nearest = ranks.reduce((best, value) =>
    Math.abs(value - rank) < Math.abs(best - rank) ? value : best,
  );
  return XP_BY_RANK[nearest] ?? 0;
}

function thresholdsFor(party: Character[]): [number, number, number, number] {
  return party.reduce<[number, number, number, number]>(
    (sum, character) => {
      const level = Math.min(20, Math.max(1, Math.round(character.level)));
      const row = THRESHOLDS[level] ?? THRESHOLDS[1]!;
      return [sum[0] + row[0], sum[1] + row[1], sum[2] + row[2], sum[3] + row[3]];
    },
    [0, 0, 0, 0],
  );
}

function multiplierFor(creatureCount: number): number {
  return MULTIPLIERS.find(([ceiling]) => creatureCount <= ceiling)?.[1] ?? 4;
}

const NUMBER = new Intl.NumberFormat('en-GB');

export function encounterDifficulty(
  creatures: EncounterCreature[],
  party: Character[],
): EncounterDifficulty | null {
  const heads = creatures.reduce((sum, entry) => sum + entry.count, 0);
  const rawXp = creatures.reduce(
    (sum, entry) => sum + xpFor(entry.monster.challengeRank) * entry.count,
    0,
  );

  const multiplier = multiplierFor(heads);
  const adjusted = Math.round(rawXp * multiplier);
  const [easy, medium, hard, deadly] = thresholdsFor(party);

  const breakdown = [
    { label: 'Party', value: party.length > 0 ? partySummary(party) : 'No characters yet' },
    { label: 'Creatures', value: `${heads} in ${creatures.length} groups` },
    { label: 'Adjusted XP', value: `${NUMBER.format(adjusted)} (×${multiplier})` },
    { label: 'Threshold — hard', value: NUMBER.format(hard) },
    { label: 'Threshold — deadly', value: NUMBER.format(deadly) },
  ];

  // Without a party there is nothing to be hard for. The XP is still worth stating, so
  // the encounter is described rather than judged.
  if (party.length === 0 || deadly === 0) {
    return {
      label: 'Unrated',
      tone: 'neutral',
      fill: 0,
      metric: { label: 'Adj. XP', value: adjusted },
      detail: `${NUMBER.format(adjusted)} adjusted XP · add characters to the party to rate this`,
      breakdown,
    };
  }

  const label =
    adjusted >= deadly
      ? 'Deadly'
      : adjusted >= hard
        ? 'Hard'
        : adjusted >= medium
          ? 'Medium'
          : adjusted >= easy
            ? 'Easy'
            : 'Trivial';

  const tone =
    label === 'Deadly'
      ? 'danger'
      : label === 'Hard'
        ? 'warning'
        : label === 'Trivial'
          ? 'neutral'
          : 'info';

  // The bar runs to the deadly threshold, so a fight past it simply pins full.
  const fill = Math.min(100, Math.round((adjusted / deadly) * 100));

  // What one more of the largest group would cost, which is the decision a DM is
  // actually making when they look at this panel.
  const largest = creatures.toSorted(
    (a, b) => xpFor(b.monster.challengeRank) - xpFor(a.monster.challengeRank),
  )[0];
  const nextXp = largest
    ? Math.round((rawXp + xpFor(largest.monster.challengeRank)) * multiplierFor(heads + 1))
    : adjusted;

  const warning =
    label !== 'Deadly' && nextXp >= deadly && largest
      ? `One more ${largest.monster.name} pushes this past the deadly threshold for ${partySummary(party)}.`
      : undefined;

  return {
    label,
    tone,
    fill,
    metric: { label: 'Adj. XP', value: adjusted },
    detail: `${NUMBER.format(adjusted)} adjusted XP · ${label.toLowerCase()} against ${partySummary(party)}`,
    breakdown,
    ...(warning ? { warning } : {}),
  };
}

function partySummary(party: Character[]): string {
  const levels = party.map((character) => character.level);
  const lowest = Math.min(...levels);
  const highest = Math.max(...levels);
  const range = lowest === highest ? `level ${lowest}` : `levels ${lowest}–${highest}`;
  return `${party.length} × ${range}`;
}
