/**
 * What the encounter list and the encounter detail both need to know.
 *
 * All of it is derived from a template plus the campaign around it. None of it decides
 * anything a ruleset owns — difficulty comes from the adapter, and this file only asks.
 */
import type {
  Character,
  CombatInstance,
  EncounterCreature,
  EncounterTemplate,
  Monster,
} from '../../domain';

/** Prepared, run before, or running right now. Decides which action the DM wants. */
export type EncounterStatus = 'live' | 'run' | 'prepared';

export function statusOf(
  encounter: EncounterTemplate,
  combats: CombatInstance[],
): { status: EncounterStatus; live: CombatInstance | null } {
  const live =
    combats.find(
      (combat) => combat.encounterTemplateId === encounter.id && combat.status !== 'ended',
    ) ?? null;

  if (live) return { status: 'live', live };
  return { status: encounter.lastRunAt ? 'run' : 'prepared', live: null };
}

/** The action a DM reaches for, which is a different one in each state. */
export function startLabel(status: EncounterStatus): string {
  if (status === 'live') return 'Resume';
  return status === 'run' ? 'Run again' : 'Start combat';
}

export function creatureCount(encounter: EncounterTemplate): number {
  return encounter.entries.reduce((sum, entry) => sum + entry.count, 0);
}

/**
 * The roster with its creatures resolved.
 *
 * An entry whose creature has been deleted is dropped rather than rendered as a blank
 * row — but `creatureCount` still counts it, so the two numbers disagreeing is how a
 * broken template becomes visible instead of silently shrinking.
 */
export function rosterOf(
  encounter: EncounterTemplate,
  monsters: Map<string, Monster>,
): (EncounterCreature & { entryId: string; hidden: boolean })[] {
  return encounter.entries.flatMap((entry) => {
    const monster = monsters.get(entry.monsterId);
    if (!monster) return [];
    return [{ entryId: entry.id, monster, count: entry.count, hidden: entry.hidden ?? false }];
  });
}

/**
 * "Bugbear Chief ×1 · Goblin ×4 · Cragmaw Ambusher ×1".
 *
 * Text rather than avatars: a DM scanning twelve encounters is reading names and counts,
 * and twelve rows of portraits is a slower read of less information.
 */
export function participantSummary(roster: EncounterCreature[]): string {
  if (roster.length === 0) return 'No creatures yet';
  return roster.map((entry) => `${entry.monster.name} ×${entry.count}`).join(' · ');
}

/** Finished characters only — a half-built draft is not something you can put in a fight. */
export function partyOf(characters: Character[]): Character[] {
  return characters.filter((character) => character.draft === undefined);
}

/**
 * Who is actually in this fight.
 *
 * Absence is stored rather than presence, so a character who joins the campaign next week
 * is in every prepared encounter without the DM reopening each one.
 */
export function presentParty(
  characters: Character[],
  encounter: Pick<EncounterTemplate, 'absentCharacterIds'>,
): Character[] {
  const absent = new Set<string>(encounter.absentCharacterIds ?? []);
  return partyOf(characters).filter((character) => !absent.has(character.id));
}
