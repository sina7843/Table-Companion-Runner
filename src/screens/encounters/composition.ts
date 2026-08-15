/**
 * The builder's editing rules, kept out of the component so they can be checked.
 *
 * Every one of them is a pure transform of a template: add, adjust, remove, merge, and
 * who is present. The screen wires them to buttons and an autosave, nothing more.
 */
import type {
  Character,
  CharacterId,
  EncounterCreature,
  EncounterTemplate,
  Monster,
  MonsterId,
} from '../../domain';

/** No group in a single fight goes past this. The design's quantity field agrees. */
export const MAX_PER_GROUP = 20;

/**
 * Above this, one round stops being something a table gets through quickly. It is a
 * warning rather than a limit — a DM running a siege knows what they are doing.
 */
export const CROWDED_COMBATANTS = 20;

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

/* ── Summary and validation ─────────────────────────────────────────────────── */

export interface EncounterSummary {
  /** Creatures counting every member of every group. */
  creatures: number;
  /** Rows in the roster — identical creatures share one. */
  groups: number;
  /** Characters taking part. */
  present: number;
  /** Everything that will roll initiative. */
  combatants: number;
  /** Entries whose creature is no longer in the library and will not be added. */
  missing: number;
}

export function summarise(
  encounter: EncounterTemplate,
  roster: EncounterCreature[],
  present: Character[],
): EncounterSummary {
  const creatures = roster.reduce((sum, entry) => sum + entry.count, 0);
  const declared = encounter.entries.reduce((sum, entry) => sum + entry.count, 0);

  return {
    creatures,
    groups: roster.length,
    present: present.length,
    combatants: creatures + present.length,
    missing: declared - creatures,
  };
}

/** One line the DM should read before starting. `blocking` stops the fight. */
export interface EncounterIssue {
  key: string;
  severity: 'blocking' | 'warning' | 'info';
  message: string;
}

/**
 * What is wrong or worth saying about this encounter.
 *
 * Structural only — a fight needs a name, something to fight, and someone to fight it.
 * How hard it is belongs to the ruleset, which states it separately, because "deadly" is
 * a judgement a system makes and "empty" is not.
 */
export function validateEncounter(
  encounter: EncounterTemplate,
  summary: EncounterSummary,
): EncounterIssue[] {
  const issues: EncounterIssue[] = [];

  if (encounter.name.trim().length === 0) {
    issues.push({ key: 'name', severity: 'blocking', message: 'Give this encounter a name' });
  }

  if (summary.groups === 0) {
    issues.push({
      key: 'empty',
      severity: 'blocking',
      message: 'Add at least one creature before starting this fight',
    });
  }

  if (summary.missing > 0) {
    issues.push({
      key: 'missing',
      severity: 'warning',
      message: `${summary.missing} ${summary.missing === 1 ? 'creature is' : 'creatures are'} no longer in the library and will not be added when this starts`,
    });
  }

  if (summary.groups > 0 && summary.present === 0) {
    issues.push({
      key: 'no-party',
      severity: 'warning',
      message: 'Nobody from the party is taking part, so this fight cannot be rated',
    });
  }

  if (summary.combatants > CROWDED_COMBATANTS) {
    issues.push({
      key: 'crowded',
      severity: 'warning',
      message: `${summary.combatants} combatants take a long time per round — group identical creatures where you can`,
    });
  }

  // A fight where nothing is visible at the start reads as a bug at the table.
  if (summary.groups > 0 && encounter.entries.every((entry) => entry.hidden)) {
    issues.push({
      key: 'all-hidden',
      severity: 'warning',
      message: 'Every creature starts hidden, so the party will see an empty battlefield',
    });
  }

  return issues;
}

export function blockingIssues(issues: EncounterIssue[]): EncounterIssue[] {
  return issues.filter((issue) => issue.severity === 'blocking');
}
