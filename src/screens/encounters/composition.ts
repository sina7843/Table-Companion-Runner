/**
 * The builder's editing rules, kept out of the component so they can be checked.
 *
 * Every one of them is a pure transform of a template: add, adjust, remove, merge, and
 * who is present. The screen wires them to buttons and an autosave, nothing more.
 */
import type { CharacterId, EncounterTemplate, Monster, MonsterId } from '../../domain';

/** No group in a single fight goes past this. The design's quantity field agrees. */
export const MAX_PER_GROUP = 20;

let entrySeq = 0;

/** Ids are per-template and never persisted anywhere else, so a counter is enough. */
export function nextEntryId(): string {
  entrySeq += 1;
  return `en-${entrySeq}`;
}

/** Adding a creature already in the roster raises its count rather than adding a row. */
export function addCreature(encounter: EncounterTemplate, monsterId: MonsterId): EncounterTemplate {
  const held = encounter.entries.some((entry) => entry.monsterId === monsterId);
  return {
    ...encounter,
    entries: held
      ? encounter.entries.map((entry) =>
          entry.monsterId === monsterId
            ? { ...entry, count: Math.min(MAX_PER_GROUP, entry.count + 1) }
            : entry,
        )
      : [...encounter.entries, { id: nextEntryId(), monsterId, count: 1 }],
  };
}

export function patchEntry(
  encounter: EncounterTemplate,
  entryId: string,
  change: Partial<Pick<EncounterTemplate['entries'][number], 'count' | 'hidden'>>,
): EncounterTemplate {
  return {
    ...encounter,
    entries: encounter.entries.map((entry) =>
      entry.id === entryId
        ? {
            ...entry,
            ...change,
            ...(change.count === undefined
              ? {}
              : { count: Math.min(MAX_PER_GROUP, Math.max(1, Math.round(change.count))) }),
          }
        : entry,
    ),
  };
}

export function removeEntry(encounter: EncounterTemplate, entryId: string): EncounterTemplate {
  return { ...encounter, entries: encounter.entries.filter((entry) => entry.id !== entryId) };
}

export function setPresent(
  encounter: EncounterTemplate,
  characterId: CharacterId,
  present: boolean,
): EncounterTemplate {
  const away = new Set<CharacterId>(encounter.absentCharacterIds ?? []);
  if (present) away.delete(characterId);
  else away.add(characterId);
  return { ...encounter, absentCharacterIds: [...away] };
}

/**
 * Folds another template's roster into this one. How a DM starts from a fight that worked
 * without leaving the builder — the source template is read, never written.
 */
export function mergeRoster(
  encounter: EncounterTemplate,
  other: EncounterTemplate,
): EncounterTemplate {
  const entries = encounter.entries.map((entry) => ({ ...entry }));
  for (const entry of other.entries) {
    const held = entries.find((existing) => existing.monsterId === entry.monsterId);
    if (held) held.count = Math.min(MAX_PER_GROUP, held.count + entry.count);
    else entries.push({ ...entry, id: nextEntryId() });
  }
  return { ...encounter, entries };
}

/** Case-insensitive name match. Search is the fast path, so it stays forgiving. */
export function searchCreatures(creatures: Monster[], term: string, limit = 60): Monster[] {
  const needle = term.trim().toLowerCase();
  return creatures
    .filter((monster) => !needle || monster.name.toLowerCase().includes(needle))
    .slice(0, limit);
}
